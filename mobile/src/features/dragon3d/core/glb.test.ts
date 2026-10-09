import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGlb } from './glb';

describe('shenlong.glb (asset 3D)', () => {
  const buf = readFileSync(resolve(__dirname, '../../../../assets/models/shenlong.glb'));
  const asset = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);

  it('tem todas as malhas que a cena usa', () => {
    for (const m of ['head_hi', 'head_lo', 'jaw_hi', 'jaw_lo', 'teeth_upper', 'teeth_lower', 'horns', 'mane', 'leg'])
      expect(asset.meshes[m]).toBeDefined();
  });

  it('tem os nós-âncora (olhos, bigodes, mandíbula, pescoço)', () => {
    for (const n of ['eye_R', 'eye_L', 'whisker_R', 'whisker_L', 'jaw_pivot', 'neck']) expect(asset.nodes[n]).toBeDefined();
  });

  it('malhas consistentes: normais, cores, índices válidos e orçamento de triângulos', () => {
    for (const [name, g] of Object.entries(asset.meshes)) {
      const n = g.attributes.position!.count;
      expect(g.attributes.normal!.count).toBe(n);
      const idx = g.index!.array;
      let max = 0;
      for (let i = 0; i < idx.length; i++) max = Math.max(max, idx[i]!);
      expect(max).toBeLessThan(n);
      if (name.endsWith('_lo')) expect(idx.length / 3).toBeLessThan(40000);
    }
    expect(asset.meshes.mane!.attributes.sway).toBeDefined();
    expect(asset.meshes.jaw_hi!.attributes.mask).toBeDefined();
  });
});
