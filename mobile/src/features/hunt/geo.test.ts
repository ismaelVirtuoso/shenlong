import { HUNT_RADIUS, angleDiff, bearing, nearestUncollected, orientationFromEuler, project, scatter, toLocal } from './geo';

const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('caçada: geometria', () => {
  it('raio corresponde a ~100 m²', () => {
    expect(Math.PI * HUNT_RADIUS ** 2).toBeCloseTo(100, 5);
  });
  it('espalha 7 esferas dentro da área, longe do início e entre si', () => {
    for (let k = 1; k < 30; k++) {
      const balls = scatter(seeded(k));
      expect(balls.map((b) => b.stars)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      for (const b of balls) {
        const r = Math.hypot(b.x, b.y);
        expect(r).toBeLessThanOrEqual(HUNT_RADIUS + 1e-9);
        expect(r).toBeGreaterThanOrEqual(2.5 - 1e-9);
      }
    }
  });
  it('lat/lng → metros', () => {
    const o = { lat: -23.55, lng: -46.63 };
    const p = toLocal(o, { lat: -23.55 + 0.00009, lng: -46.63 }); // ~10 m ao norte
    expect(p.y).toBeCloseTo(10, 0);
    expect(Math.abs(p.x)).toBeLessThan(0.01);
  });
  it('rumo e diferença de ângulo', () => {
    expect(bearing(0, 0, 0, 5)).toBeCloseTo(0);
    expect(bearing(0, 0, 5, 0)).toBeCloseTo(90);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
  });
  it('esfera mais próxima ignora as coletadas', () => {
    const balls = [{ stars: 1, x: 1, y: 0, collected: true }, { stars: 2, x: 3, y: 0, collected: false }];
    expect(nearestUncollected(balls, 0, 0)!.ball.stars).toBe(2);
  });
  it('projeção: à frente e no nível dos olhos fica no centro; perto fica abaixo', () => {
    const far = project(0, 100, 0, 400, 800);
    expect(far.x).toBeCloseTo(200);
    const near = project(0, 1, 0, 400, 800);
    expect(near.y).toBeGreaterThan(400); // abaixo do centro (no chão)
    expect(project(17, 3, 0, 400, 800).x).toBeCloseTo(400); // borda direita com hFov 34°
  });
});

describe('caçada: orientação do aparelho', () => {
  const H = Math.PI / 2;
  it('Android: em pé olhando para o norte → rumo 0, horizonte', () => {
    const o = orientationFromEuler(0, H, 0, false);
    expect(o.heading).toBeCloseTo(0);
    expect(o.pitch).toBeCloseTo(0);
  });
  it('Android: deitado, topo para o leste → rumo 90, câmera para o chão', () => {
    const o = orientationFromEuler(-H, 0, 0, false);
    expect(o.heading).toBeCloseTo(90);
    expect(o.pitch).toBeCloseTo(-90);
  });
  it('Android: em pé virado para o leste, mesmo com ângulos degenerados (gimbal)', () => {
    // em pé (β = 90°) só a soma α+γ importa; qualquer combinação dá o mesmo rumo
    expect(orientationFromEuler(-H, H, 0, false).heading).toBeCloseTo(90);
    expect(orientationFromEuler(-H / 2, H, -H / 2, false).heading).toBeCloseTo(90);
  });
  it('Android: inclinado 45° para baixo olhando para o sul', () => {
    const o = orientationFromEuler(Math.PI, Math.PI / 4, 0, false);
    expect(o.heading).toBeCloseTo(180);
    expect(o.pitch).toBeCloseTo(-45);
  });
  it('iOS (x = norte, y = oeste): em pé olhando para o norte', () => {
    // em pé, topo para cima, lado direito para o leste (−y): α+γ = −90°
    const o = orientationFromEuler(-H, H, 0, true);
    expect(o.heading).toBeCloseTo(0);
    expect(o.pitch).toBeCloseTo(0);
  });
  it('iOS: deitado com yaw 0 → topo para o oeste', () => {
    expect(orientationFromEuler(0, 0, 0, true).topHeading).toBeCloseTo(270);
  });
});
