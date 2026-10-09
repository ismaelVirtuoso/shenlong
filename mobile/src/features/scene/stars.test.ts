import { STAR_R, starCenters } from './stars';

describe('estrelas das esferas', () => {
  it('N estrelas, todas dentro da esfera e sem se sobrepor (mesmo tamanho)', () => {
    for (let n = 1; n <= 7; n++) {
      const c = starCenters(n);
      expect(c).toHaveLength(n);
      for (const p of c) expect(Math.hypot(p.x, p.y) + STAR_R).toBeLessThan(0.75);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) expect(Math.hypot(c[i]!.x - c[j]!.x, c[i]!.y - c[j]!.y)).toBeGreaterThan(STAR_R * 1.9);
    }
  });
});
