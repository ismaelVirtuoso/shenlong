import * as THREE from 'three';

const fract = (x: number) => x - Math.floor(x);
const rnd = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

function dataTexture(data: Uint8Array, w: number, h: number, srgb = false) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Converte um campo de altura (tileável) em normal map (RGB) + detalhe em outra textura. */
function heightToTextures(H: Float32Array, size: number, strength: number, detail: (i: number, h: number) => [number, number, number]) {
  const nrm = new Uint8Array(size * size * 4);
  const det = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => H[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      nrm[i * 4] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nrm[i * 4 + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      nrm[i * 4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nrm[i * 4 + 3] = 255;
      const [r, g, b] = detail(i, H[i]!);
      det[i * 4] = r; det[i * 4 + 1] = g; det[i * 4 + 2] = b; det[i * 4 + 3] = Math.round(H[i]! * 255);
    }
  return { normal: dataTexture(nrm, size, size), detail: dataTexture(det, size, size) };
}

/**
 * Escamas sobrepostas (tipo réptil/peixe). u = ao longo do corpo (cabeça→cauda), v = em volta.
 * A escama mais próxima da cabeça cobre a parte anterior da seguinte; borda livre levantada.
 * detail: R = multiplicador de albedo (cavidades escuras), G = rugosidade, B = variação por escama.
 */
export function makeScaleTextures(size = 256, perTile = 8) {
  const H = new Float32Array(size * size);
  const R = new Float32Array(size * size);
  const V = new Float32Array(size * size);
  const cell = 1 / perTile;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let best = -1, bestU = Infinity, bestH = 0, bestR = 1, bestV = 0;
      const col = Math.floor(u / cell);
      for (let dc = -2; dc <= 1; dc++) {
        const c = col + dc;
        const off = (((c % 2) + 2) % 2) * 0.5;
        const row = Math.floor(v / cell - off);
        for (let dr = -1; dr <= 1; dr++) {
          const r = row + dr;
          const cu = (c + 0.5) * cell, cv = (r + 0.5 + off) * cell;
          const du = (u - cu) / (cell * 0.95), dv = (v - cv) / (cell * 0.62);
          const rr = du * du + dv * dv;
          if (rr >= 1) continue;
          if (cu < bestU) {
            bestU = cu;
            best = 1;
            const s = (du + 1) / 2; // 0 = parte coberta, 1 = borda livre
            const edge = Math.min(1, (1 - Math.sqrt(rr)) / 0.18);
            bestH = (0.25 + 0.75 * s) * (edge * edge * (3 - 2 * edge)) + 0.08 * (1 - Math.abs(dv)) * s;
            bestR = rr;
            const wc = ((c % perTile) + perTile) % perTile, wr = ((r % perTile) + perTile) % perTile;
            bestV = rnd(wc, wr);
          }
        }
      }
      H[y * size + x] = best < 0 ? 0 : bestH;
      R[y * size + x] = bestR;
      V[y * size + x] = bestV;
    }
  return heightToTextures(H, size, 3.2, (i, h) => {
    const cav = Math.min(1, 0.45 + h * 0.75);
    return [Math.round(cav * 230), Math.round((0.62 - h * 0.28 + R[i]! * 0.12) * 255), Math.round(V[i]! * 255)];
  });
}

/** Placas ventrais transversais (barriga), tileável em u. */
export function makeBellyTextures(size = 128, plates = 4) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const s = fract((x / size) * plates);
      const across = Math.abs(y / size - 0.5) * 2; // levemente arredondadas nas pontas
      H[y * size + x] = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.35) * (1 - 0.25 * across * across);
    }
  return heightToTextures(H, size, 2.4, (_i, h) => [Math.round((0.55 + 0.45 * h) * 255), Math.round((0.5 - 0.15 * h) * 255), 128]);
}

/** Ruído suave para nuvens/raios de luz (canal alfa = densidade). */
export function makeCloudTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const g = 16;
  const grid = Array.from({ length: (g + 1) * (g + 1) }, (_, i) => rnd(i % (g + 1), Math.floor(i / (g + 1))));
  const n = (x: number, y: number, f: number) => {
    const X = (x * f) % g, Y = (y * f) % g;
    const i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = grid[j * (g + 1) + i]!, b = grid[j * (g + 1) + i + 1]!, c = grid[(j + 1) * (g + 1) + i]!, d = grid[(j + 1) * (g + 1) + i + 1]!;
    return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const f = 0.5 * n(u, v, 4) + 0.3 * n(u, v, 8) + 0.2 * n(u, v, 16);
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const disc = Math.max(0, 1 - r);
      const a = Math.max(0, Math.min(1, (f - 0.35) * 2.2)) * Math.pow(disc, 0.7);
      const i = (y * size + x) * 4;
      const lum = 0.75 + 0.25 * f;
      data[i] = data[i + 1] = data[i + 2] = Math.round(lum * 255);
      data[i + 3] = Math.round(a * 255);
    }
  const t = dataTexture(data, size, size, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Gradiente radial (brilhos aditivos: olhos, esferas, orbe). */
export function makeGlowTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x / (size - 1) - 0.5, y / (size - 1) - 0.5) * 2;
      const a = Math.pow(Math.max(0, 1 - r), 2.2);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  const t = dataTexture(data, size, size, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Feixe de luz vertical (raios volumétricos falsos). */
export function makeRayTexture(w = 64, h = 128) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1);
      const across = Math.pow(Math.sin(Math.PI * u), 3);
      const along = Math.pow(v, 1.3) * (1 - Math.pow(v, 8));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(across * along * 255);
    }
  const t = dataTexture(data, w, h, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
