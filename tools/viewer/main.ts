// Viewer de inspeção do Shenlong 3D (mesma cena do app, em WebGL do navegador).
// Parâmetros no hash: #appear=1&t=6000&speak=0&wish=0&yaw=30&pitch=10&dist=5&q=high
import * as THREE from 'three';
import { DragonScene } from '../../mobile/src/features/dragon3d/core/DragonScene';
import { parseGlb } from '../../mobile/src/features/dragon3d/core/glb';
import type { DragonInput, QualityLevel } from '../../mobile/src/features/dragon3d/core/types';

const P = new URLSearchParams(location.hash.slice(1));
const num = (k: string, d: number) => (P.has(k) ? Number(P.get(k)) : d);

async function main() {
  const w = num('w', window.innerWidth), h = num('h', window.innerHeight);
  const canvas = document.querySelector('canvas')!;
  canvas.width = w; canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const buf = await (await fetch('/mobile/assets/models/shenlong.glb')).arrayBuffer();
  const asset = parseGlb(buf);
  const scene = new DragonScene(renderer, asset, (P.get('q') as QualityLevel) ?? 'high', w, h);
  if (P.has('yaw')) scene.debugOrbit = { yaw: num('yaw', 0), pitch: num('pitch', 0), dist: num('dist', 5) };

  const T = num('t', 8000);
  const inp: DragonInput = {
    t: 0, appear: num('appear', 1), summon: num('summon', 1), speak: num('speak', 0), listen: num('listen', 0),
    think: num('think', 0), wish: num('wish', 0), flash: num('flash', 0), poke: 0, glow: num('glow', 0.3),
  };
  // simula os últimos segundos (bigodes assentam com a física)
  for (let t = Math.max(0, T - 3000); t <= T; t += 33) {
    inp.t = t;
    scene.update(inp);
  }
  if (P.has('icon')) addIconProps(scene);
  // isolamento p/ depuração: nodragon, hide=nome1,nome2 (tipos: Sprite, Mesh…)
  if (P.has('nodragon')) scene.scene.getObjectByName('dragon')!.visible = false;
  for (const k of (P.get('hide') ?? '').split(',').filter(Boolean))
    scene.scene.traverse((o) => { if ((o as any).type === k || o.name === k) o.visible = false; });
  scene.render();
  document.title = 'ready';
  if (P.has('anim')) {
    const t0 = performance.now();
    const loop = () => { inp.t = T + performance.now() - t0; scene.update(inp); scene.render(); requestAnimationFrame(loop); };
    loop();
  }
}
/** Composição do ícone: esfera do dragão de 4 estrelas em 3D, em primeiro plano. */
function addIconProps(scene: DragonScene) {
  const cam = scene.camera;
  const ball = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.MeshPhysicalMaterial({ color: '#ff9b1f', emissive: '#ff5a00', emissiveIntensity: 0.55, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  );
  ball.add(sphere);
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.075 : 0.18;
    k ? star.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  const starGeo = new THREE.ShapeGeometry(star);
  const starMat = new THREE.MeshStandardMaterial({ color: '#c8140f', emissive: '#7a0505', roughness: 0.3 });
  for (const [x, y] of [[-0.24, 0.22], [0.24, 0.22], [-0.24, -0.24], [0.24, -0.24]]) {
    const m = new THREE.Mesh(starGeo, starMat);
    const dir = new THREE.Vector3(x!, y!, 1).normalize();
    m.position.copy(dir).multiplyScalar(1.002);
    m.lookAt(dir.clone().multiplyScalar(2));
    ball.add(m);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ff8a1a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8,
    map: (() => { const n = 64, d = new Uint8Array(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = Math.hypot(x / (n - 1) - 0.5, y / (n - 1) - 0.5) * 2; const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 2.5) * 255); } const t = new THREE.DataTexture(d, n, n); t.needsUpdate = true; return t; })() }));
  glow.scale.setScalar(3.4);
  ball.add(glow);
  const light = new THREE.PointLight('#ff8a2a', 10, 8, 1.6);
  ball.add(light);
  // posiciona no espaço da câmera: canto inferior esquerdo, perto da lente
  const p = new THREE.Vector3(Number(P.get('bx') ?? -0.95), Number(P.get('by') ?? -1.15), -3.6).applyMatrix4(cam.matrixWorld);
  ball.position.copy(p);
  ball.scale.setScalar(Number(P.get('bs') ?? 0.55));
  ball.lookAt(cam.position);
  ball.rotateY(0.35);
  scene.scene.add(ball);
}

main().catch((e) => { document.body.style.color = 'red'; document.body.textContent = String(e?.stack ?? e); document.title = 'error'; });
