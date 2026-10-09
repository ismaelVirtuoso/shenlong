// Poligonização de SDF por "surface nets" + projeção de Newton (malha suave, sem lascas)
import { gradient } from './sdf.mjs';

/**
 * @param f      sdf(x,y,z)
 * @param bbox   [x0,y0,z0,x1,y1,z1]
 * @param h      tamanho do voxel
 * @returns {positions: Float32Array, normals: Float32Array, indices: Uint32Array}
 */
export function surfaceNets(f, bbox, h) {
  const [x0, y0, z0, x1, y1, z1] = bbox;
  const nx = Math.ceil((x1 - x0) / h) + 1;
  const ny = Math.ceil((y1 - y0) / h) + 1;
  const nz = Math.ceil((z1 - z0) / h) + 1;
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // amostragem com banda estreita: grade grossa decide onde vale a pena amostrar fino
  const field = new Float32Array(nx * ny * nz);
  const C = 4;
  const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(x0 + i * C * h, y0 + j * C * h, z0 + k * C * h);
  const band = C * h * 1.8;
  for (let k = 0; k < nz; k++) {
    const ck = Math.round(k / C);
    for (let j = 0; j < ny; j++) {
      const cj = Math.round(j / C);
      for (let i = 0; i < nx; i++) {
        const c = coarse[Math.round(i / C) + cx * (cj + cy * ck)];
        field[idx(i, j, k)] = Math.abs(c) > band ? c : f(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  }

  // 1 vértice por célula cruzada pela superfície
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corners[c];
          v[c] = field[idx(i + a, j + b, k + d)];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const va = v[a], vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const ca = corners[a], cb = corners[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          n++;
        }
        let px = x0 + (i + sx / n) * h, py = y0 + (j + sy / n) * h, pz = z0 + (k + sz / n) * h;
        // projeta na superfície real (detalhe abaixo do voxel)
        for (let it = 0; it < 3; it++) {
          const d = f(px, py, pz);
          const g = gradient(f, px, py, pz, h * 0.25);
          px -= g[0] * d; py -= g[1] * d; pz -= g[2] * d;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(px, py, pz);
      }

  // quads nas arestas com troca de sinal
  const ind = [];
  const P = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
  const d2 = (a, b) => { const A = P(a), B = P(b); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    if (d2(a, c) < d2(b, d)) ind.push(a, b, c, a, c, d);
    else ind.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = field[idx(i, j, k)] < 0;
        if (i < nx - 1 && s0 !== field[idx(i + 1, j, k)] < 0)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !s0);
        if (j < ny - 1 && s0 !== field[idx(i, j + 1, k)] < 0)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !s0);
        if (k < nz - 1 && s0 !== field[idx(i, j, k + 1)] < 0)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !s0);
      }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  for (let q = 0; q < pos.length / 3; q++) {
    const g = gradient(f, pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2], h * 0.5);
    normals.set(g, q * 3);
  }
  // garante winding coerente com a normal do SDF (triângulos virados para fora)
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t], b = ind[t + 1], c = ind[t + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx_ = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny_ = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz_ = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx_ + fy * ny_ + fz * nz_ < 0) { ind[t + 1] = c; ind[t + 2] = b; }
  }
  return { positions, normals, indices: new Uint32Array(ind) };
}

/** Oclusão ambiente a partir do SDF (iq): 1 = aberto, 0 = fechado */
export function bakeAO(f, positions, normals, dist = 0.22, steps = 5) {
  const ao = new Float32Array(positions.length / 3);
  for (let q = 0; q < ao.length; q++) {
    const px = positions[q * 3], py = positions[q * 3 + 1], pz = positions[q * 3 + 2];
    const nx = normals[q * 3], ny = normals[q * 3 + 1], nz = normals[q * 3 + 2];
    let occ = 0, w = 1;
    for (let s = 1; s <= steps; s++) {
      const t = (dist * s) / steps;
      occ += (t - f(px + nx * t, py + ny * t, pz + nz * t)) * w;
      w *= 0.6;
    }
    ao[q] = Math.min(1, Math.max(0, 1 - occ * 2.2));
  }
  return ao;
}
