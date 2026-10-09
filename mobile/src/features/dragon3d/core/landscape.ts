import * as THREE from 'three';
import type { QualityLevel } from './types';

/** Paisagem no estilo dos cenários do anime: pilares de rocha com topo verde, cordilheira ao fundo, chão. */
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const p = g.attributes.position!;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Pilar de rocha (mesa) com estratos, base mais larga e topo coberto de grama. */
function spire(h: number, r: number, segs: number) {
  const g = new THREE.CylinderGeometry(r * 0.82, r * 1.25, h, segs, 10, false);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position!;
  const k = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const top = y > h - 0.01;
    const n = 1 + 0.14 * Math.sin(a * 3 + k) + 0.08 * Math.sin(a * 7 + y * 0.8 + k) + 0.06 * Math.sin(y * 1.3 + k);
    p.setXYZ(i, x * n, top ? y + 0.25 * Math.sin(a * 2 + k) : y, z * n);
  }
  g.computeVertexNormals();
  const rock = new THREE.Color('#9a6e44'), dark = new THREE.Color('#5e4128'), light = new THREE.Color('#c79a68');
  const grass = new THREE.Color('#5aa83a'), grassDark = new THREE.Color('#3b7d2a');
  colorize(g, (_x, y, _z, out) => {
    if (y > h - 0.35) { out.copy(grass).lerp(grassDark, 0.3 * Math.sin(y * 9) + 0.3); return; }
    const band = 0.5 + 0.5 * Math.sin(y * 2.1 + k);
    out.copy(dark).lerp(rock, 0.4 + 0.5 * (y / h)).lerp(light, band * 0.3);
  });
  return g;
}

/** Montanha ao fundo (cone irregular), azulada pela distância. */
function mountain(h: number, r: number) {
  const g = new THREE.ConeGeometry(r, h, 28, 8, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position!;
  const k = rnd() * 10, k2 = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const n = 1 + 0.28 * Math.sin(a * 3 + k) + 0.16 * Math.sin(a * 7 + k2) + 0.08 * Math.sin(a * 13 + y);
    // cristas irregulares: a altura varia com o ângulo (picos e selas)
    const hy = y * (0.75 + 0.3 * Math.sin(a * 2 + k2) + 0.12 * Math.sin(a * 5 + k));
    p.setXYZ(i, x * n, hy, z * n);
  }
  g.computeVertexNormals();
  const base = new THREE.Color('#2f5a4a'), peak = new THREE.Color('#6f8f86');
  colorize(g, (_x, y, _z, out) => out.copy(base).lerp(peak, Math.min(1, y / h)));
  return g;
}

export function createLandscape(quality: QualityLevel) {
  seed = 11;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const segs = quality === 'low' ? 9 : 14;
  // [x, z, altura, raio] — base em y = -16 (abaixo das nuvens)
  const spires: [number, number, number, number][] = [
    [-7.5, -12, 12.5, 2.2], [8.5, -15, 13, 2.6], [-4.2, -22, 11, 2.0], [5.5, -26, 13.5, 2.8],
    [-11.5, -28, 15, 3.2], [13, -32, 14, 3.0], [-1.2, -38, 10.5, 2.4], [17, -44, 16, 3.6], [-17, -46, 17, 3.8],
  ];
  const n = quality === 'low' ? 5 : spires.length;
  for (const [x, z, h, r] of spires.slice(0, n)) {
    const m = new THREE.Mesh(spire(h, r, segs), mat);
    m.position.set(x, -16, z);
    m.rotation.y = rnd() * 6;
    group.add(m);
  }
  // cordilheira ao fundo
  const mountains: [number, number, number, number][] = [
    [-38, -90, 20, 20], [-16, -100, 24, 22], [4, -92, 17, 16], [20, -104, 23, 22], [40, -95, 19, 18],
    [-60, -110, 22, 24], [62, -112, 24, 24], [-2, -120, 26, 28],
  ];
  for (const [x, z, h, r] of mountains) {
    const m = new THREE.Mesh(mountain(h, r), mat);
    m.position.set(x, -20, z);
    group.add(m);
  }
  // chão verde lá embaixo
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.MeshStandardMaterial({ color: '#3f7a32', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -16;
  group.add(ground);
  return group;
}
