import { isFarewell, isInvocation, levenshtein, normalize } from './phrases';

describe('isInvocation', () => {
  it.each([
    'Shenlong, apareça!',
    'shenlong aparece',
    'Xenlong, aparece!',
    'shen long aparece',
    'Shenlon!',
    'Shenron, apareça',
    'eu chamo o Shenlong',
    'SHENLONG APAREÇA',
  ])('aceita "%s"', (t) => expect(isInvocation(t)).toBe(true));

  it.each([
    '',
    'apareça',
    'oi tudo bem',
    'dragão aparece',
    'shenlong vai embora',
    'tchau shenlong',
    'ruído ruído ruído ruído ruído ruído ruído ruído ruído ruído shenlong',
    'shell',
    'banana long',
  ])('rejeita "%s"', (t) => expect(isInvocation(t)).toBe(false));
});

describe('helpers', () => {
  it('normaliza acentos e pontuação', () => expect(normalize('Apareça!!')).toBe('apareca'));
  it('levenshtein', () => expect(levenshtein('kitten', 'sitting')).toBe(3));
  it('despedida', () => {
    expect(isFarewell('Tchau, Shenlong!')).toBe(true);
    expect(isFarewell('quero um cachorro')).toBe(false);
  });
});
