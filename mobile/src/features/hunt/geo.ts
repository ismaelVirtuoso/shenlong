/** Geometria da caçada (pura, testável): coordenadas locais em metros (x = leste, y = norte). */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BallSpot {
  /** nº de estrelas (1..7) */
  stars: number;
  /** posição em metros relativa à origem da caçada */
  x: number;
  y: number;
  collected: boolean;
}

/** Área de busca pedida: ~100 m² → raio ≈ √(100/π) ≈ 5,6 m (cabe dentro de casa/quintal). */
export const HUNT_AREA_M2 = 100;
export const HUNT_RADIUS = Math.sqrt(HUNT_AREA_M2 / Math.PI);

const R_EARTH = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** lat/lng → metros (leste, norte) em relação à origem (aproximação local, ótima para dezenas de metros). */
export function toLocal(o: LatLng, p: LatLng): { x: number; y: number } {
  return {
    x: rad(p.lng - o.lng) * R_EARTH * Math.cos(rad(o.lat)),
    y: rad(p.lat - o.lat) * R_EARTH,
  };
}

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

/** Rumo (graus, 0 = norte, 90 = leste) do ponto a até b. */
export function bearing(ax: number, ay: number, bx: number, by: number) {
  const b = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
  return (b + 360) % 360;
}

/** Diferença de ângulo em (-180, 180]. */
export const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

/** Espalha as 7 esferas aleatoriamente no raio da caçada, longe da pessoa e umas das outras. */
export function scatter(rand: () => number = Math.random, radius = HUNT_RADIUS): BallSpot[] {
  const balls: BallSpot[] = [];
  const minFromStart = Math.min(2.5, radius * 0.45); // nenhuma já ao alcance no início
  let minGap = Math.min(1.6, radius * 0.35);
  let tries = 0;
  while (balls.length < 7) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(minFromStart ** 2 + rand() * (radius ** 2 - minFromStart ** 2)); // uniforme na área
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (balls.every((b) => dist(b.x, b.y, x, y) >= minGap)) balls.push({ stars: balls.length + 1, x, y, collected: false });
    if (++tries % 400 === 0) minGap *= 0.85; // nunca trava
  }
  return balls;
}

export function nearestUncollected(balls: BallSpot[], x: number, y: number): { ball: BallSpot; d: number } | null {
  let best: { ball: BallSpot; d: number } | null = null;
  for (const b of balls) {
    if (b.collected) continue;
    const d = dist(x, y, b.x, b.y);
    if (!best || d < best.d) best = { ball: b, d };
  }
  return best;
}

/**
 * Projeção da esfera na tela da câmera ("RA por sensores"): rumo relativo → x; elevação → y.
 * A esfera fica no chão (≈1,1 m abaixo dos olhos): perto, é preciso olhar para baixo.
 * hFov/vFov: campo de visão efetivo da prévia em retrato (câmera principal, aspect-fill).
 */
export function project(
  relBearing: number, distance: number, pitchDeg: number, w: number, h: number, hFov = 34, vFov = 64, eye = 1.1,
) {
  const elev = (-Math.atan2(eye, Math.max(distance, 0.3)) * 180) / Math.PI;
  return { x: w / 2 + (relBearing / hFov) * w, y: h / 2 - ((elev - pitchDeg) / vFov) * h, elev };
}

const DEG = 180 / Math.PI;

/**
 * Rumo e inclinação a partir dos ângulos do DeviceMotion. Os dois sistemas usam R = Rz(α)·Rx(β)·Ry(γ)
 * (aparelho → mundo); refazer a matriz evita o "gimbal lock" dos ângulos com o celular em pé
 * (justo a posição de usar a câmera). Mundo: Android = (leste, norte, cima); iOS = (norte, oeste, cima).
 * "Frente" = topo do aparelho (deitado) misturado com a direção da câmera traseira (em pé).
 */
export function orientationFromEuler(alpha: number, beta: number, gamma: number, ios: boolean) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta), cc = Math.cos(gamma), sc = Math.sin(gamma);
  const top = [-sa * cb, ca * cb, sb]; // eixo y do aparelho no mundo
  const back = [ca * sc + sa * sb * cc, sa * sc - ca * sb * cc, cb * cc]; // eixo z (a câmera olha para −z)
  const hx = top[0]! - back[0]!, hy = top[1]! - back[1]!;
  const east = ios ? -hy : hx, north = ios ? hx : hy;
  const tE = ios ? -top[1]! : top[0]!, tN = ios ? top[0]! : top[1]!;
  return {
    heading: ((Math.atan2(east, north) * DEG) + 360) % 360,
    /** elevação da câmera traseira */
    pitch: Math.asin(Math.max(-1, Math.min(1, -back[2]!))) * DEG,
    /** rumo do topo do aparelho (o que a bússola do sistema mede) e quão "deitado" ele está */
    topHeading: ((Math.atan2(tE, tN) * DEG) + 360) % 360,
    topFlat: 1 - Math.abs(top[2]!),
  };
}
