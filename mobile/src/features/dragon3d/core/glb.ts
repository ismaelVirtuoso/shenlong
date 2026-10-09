import * as THREE from 'three';

/** Conteúdo do shenlong.glb: malhas por nome e nós-âncora (olhos, bigodes, pivô da mandíbula…). */
export interface DragonAsset {
  meshes: Record<string, THREE.BufferGeometry>;
  nodes: Record<string, THREE.Vector3>;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/**
 * Leitor GLB mínimo (só geometria: atributos + índices + nós com translação).
 * Evita o GLTFLoader, que depende de APIs de imagem/DOM ausentes no React Native.
 */
export function parseGlb(buffer: ArrayBuffer): DragonAsset {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('não é GLB');
  let offset = 12;
  let json: any = null;
  let bin: ArrayBuffer | null = null;
  while (offset < buffer.byteLength) {
    const len = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = buffer.slice(start, start + len);
    offset = start + len;
  }
  if (!json || !bin) throw new Error('GLB incompleto');

  const read = (index: number) => {
    const acc = json.accessors[index];
    const bv = json.bufferViews[acc.bufferView];
    const n = acc.count * COMPONENTS[acc.type]!;
    const at = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const slice = bin!.slice(at, at + bv.byteLength);
    let arr: Float32Array | Uint8Array | Uint32Array | Uint16Array;
    if (acc.componentType === 5126) arr = new Float32Array(slice, 0, n);
    else if (acc.componentType === 5121) arr = new Uint8Array(slice, 0, n);
    else if (acc.componentType === 5125) arr = new Uint32Array(slice, 0, n);
    else arr = new Uint16Array(slice, 0, n);
    return { arr, size: COMPONENTS[acc.type]!, normalized: !!acc.normalized };
  };

  const meshes: Record<string, THREE.BufferGeometry> = {};
  for (const m of json.meshes) {
    const prim = m.primitives[0];
    const g = new THREE.BufferGeometry();
    const names: Record<string, string> = { POSITION: 'position', NORMAL: 'normal', COLOR_0: 'color', _SWAY: 'sway', _MASK: 'mask', TEXCOORD_0: 'uv' };
    for (const [key, idx] of Object.entries(prim.attributes)) {
      const { arr, size, normalized } = read(idx as number);
      g.setAttribute(names[key] ?? key.toLowerCase(), new THREE.BufferAttribute(arr, size, normalized));
    }
    if (prim.indices != null) g.setIndex(new THREE.BufferAttribute(read(prim.indices).arr, 1));
    g.computeBoundingSphere();
    meshes[m.name] = g;
  }
  const nodes: Record<string, THREE.Vector3> = {};
  for (const n of json.nodes) if (n.translation) nodes[n.name] = new THREE.Vector3().fromArray(n.translation);
  return { meshes, nodes };
}
