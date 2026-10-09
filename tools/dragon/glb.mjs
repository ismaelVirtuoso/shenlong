// Escritor GLB mínimo (glTF 2.0 binário), sem dependências.
import { writeFileSync } from 'node:fs';

const FLOAT = 5126, UBYTE = 5121, UINT = 5125;

export function writeGlb(path, { meshes, nodes }) {
  const chunks = [];
  let byteLength = 0;
  const bufferViews = [], accessors = [];
  const push = (typed, target) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (typed, type, componentType, count, extra = {}) => {
    const bufferView = push(typed, extra.target);
    delete extra.target;
    accessors.push({ bufferView, componentType, count, type, ...extra });
    return accessors.length - 1;
  };

  const gltfMeshes = [], gltfNodes = [];
  for (const m of meshes) {
    const n = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], m.positions[i * 3 + c]);
        max[c] = Math.max(max[c], m.positions[i * 3 + c]);
      }
    const attributes = {
      POSITION: accessor(m.positions, 'VEC3', FLOAT, n, { min, max, target: 34962 }),
      NORMAL: accessor(m.normals, 'VEC3', FLOAT, n, { target: 34962 }),
    };
    if (m.colors) attributes.COLOR_0 = accessor(m.colors, 'VEC4', UBYTE, n, { normalized: true, target: 34962 });
    if (m.sway) attributes._SWAY = accessor(m.sway, 'SCALAR', FLOAT, n, { target: 34962 });
    if (m.mask) attributes._MASK = accessor(m.mask, 'SCALAR', FLOAT, n, { target: 34962 });
    const indices = accessor(m.indices, 'SCALAR', UINT, m.indices.length, { target: 34963 });
    gltfMeshes.push({ name: m.name, primitives: [{ attributes, indices }] });
    gltfNodes.push({ name: m.name, mesh: gltfMeshes.length - 1 });
  }
  for (const [name, t] of Object.entries(nodes)) gltfNodes.push({ name, translation: t });

  const json = {
    asset: { version: '2.0', generator: 'shenlong tools/dragon' },
    scene: 0,
    scenes: [{ nodes: gltfNodes.map((_, i) => i) }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = Buffer.concat([Buffer.from(jsonBytes), Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (byteLength % 4)) % 4;
  const bin = Buffer.concat([...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)), Buffer.alloc(bpad)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBytes.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([header, jh, jsonBytes, bh, bin]);
  writeFileSync(path, out);
  return out.length;
}
