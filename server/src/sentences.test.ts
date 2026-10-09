import { describe, expect, it } from 'vitest';
import { SentenceStream } from './sentences.js';
import { isUnsafe } from './safety.js';

function feed(chunks: string[]) {
  const s = new SentenceStream();
  const sentences: string[] = [];
  const flags: string[] = [];
  for (const c of chunks) {
    const r = s.push(c);
    sentences.push(...r.sentences);
    flags.push(...r.flags);
  }
  const r = s.end();
  sentences.push(...r.sentences);
  flags.push(...r.flags);
  return { sentences, flags };
}

describe('SentenceStream', () => {
  it('divide em frases e extrai tag partida', () => {
    const r = feed(['[CONC', 'EDIDO] Feche os olhos... sinta o vento! Você ', 'voa entre as nuvens. Gostou?']);
    expect(r.flags).toEqual(['concedido']);
    expect(r.sentences).toEqual(['Feche os olhos... sinta o vento!', 'Você voa entre as nuvens.', 'Gostou?']);
  });
  it('tag [ADEUS] no fim', () => {
    const r = feed(['Até breve, pequeno viajante. [ADE', 'US]']);
    expect(r.flags).toEqual(['adeus']);
    expect(r.sentences).toEqual(['Até breve, pequeno viajante.']);
  });
  it('sem pontuação final ainda emite', () => {
    expect(feed(['Olá viajante']).sentences).toEqual(['Olá viajante']);
  });
});

describe('safety', () => {
  it('detecta termos', () => {
    expect(isUnsafe('quero uma arma')).toBe(true);
    expect(isUnsafe('quero voar')).toBe(false);
    expect(isUnsafe('quero um cachorro')).toBe(false);
  });
});
