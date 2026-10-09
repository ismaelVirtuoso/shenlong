import { ARM_LAYERS } from './arm';
import { ANCHORS, HEAD_LAYERS } from './head';
import { cloud, rockSpire } from './landscape';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('arte vetorial do Shenlong', () => {
  it('cabeça tem todas as partes animáveis (fundo, rosto, boca, mandíbula)', () => {
    const parts = new Set(HEAD_LAYERS.map((l) => l.part));
    for (const p of ['back', 'head', 'mouth', 'jaw']) expect(parts.has(p as never)).toBe(true);
  });

  it('todas as camadas são caminhos válidos dentro da área da arte', () => {
    for (const l of [...HEAD_LAYERS, ...ARM_LAYERS]) {
      expect(l.d.startsWith('M')).toBe(true);
      const n = numbers(l.d);
      expect(n.length).toBeGreaterThanOrEqual(4);
      for (const v of n) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThan(1500);
      }
      expect(l.fill || l.stroke).toBeTruthy();
    }
  });

  it('âncoras (olhos, bigodes) caem sobre o rosto e são simétricas', () => {
    for (const [x, y] of Object.values(ANCHORS)) {
      expect(x).toBeGreaterThan(200);
      expect(x).toBeLessThan(800);
      expect(y).toBeGreaterThan(300);
      expect(y).toBeLessThan(900);
    }
    expect(ANCHORS.eyeL[0] + ANCHORS.eyeR[0]).toBeCloseTo(1000);
    expect(ANCHORS.eyeL[1]).toBeCloseTo(ANCHORS.eyeR[1]);
  });

  it('cenário gera rochas e nuvens fechadas', () => {
    expect(rockSpire(0, 100, 600, 800, 5).length).toBe(4);
    expect(cloud(100, 100, 200).every((s) => s.pts.length >= 8)).toBe(true);
  });
});
