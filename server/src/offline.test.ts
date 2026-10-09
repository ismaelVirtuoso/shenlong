import { describe, expect, it } from 'vitest';
import { extractWish, offlineReply } from './providers/offline.js';

const u = (content: string) => [{ role: 'user' as const, content }];

describe('Shenlong sem chave (regras)', () => {
  it('extrai o desejo', () => {
    expect(extractWish('Eu quero um cachorro.')).toBe('um cachorro');
    expect(extractWish('queria voar')).toBe('voar');
    expect(extractWish('Eu gostaria de ser um super-herói!')).toBe('ser um super-herói');
    expect(extractWish('oi tudo bem')).toBeNull();
  });
  it('concede com a frase da criança e pergunta o próximo', () => {
    const r = offlineReply(u('Eu quero um cachorro'), 0);
    expect(r.startsWith('[CONCEDIDO]')).toBe(true);
    expect(r.toLowerCase()).toContain('cachorro');
    expect(r).not.toContain('[ADEUS]');
  });
  it('no 3º desejo se despede', () => {
    expect(offlineReply(u('quero um bolo'), 2)).toContain('[ADEUS]');
  });
  it('despedida, saudação e fallback', () => {
    expect(offlineReply(u('tchau Shenlong'), 0)).toContain('[ADEUS]');
    expect(offlineReply(u('Oi!'), 0)).toContain('desejo');
    expect(offlineReply(u('banana azul'), 0)).toContain('desej');
  });
});
