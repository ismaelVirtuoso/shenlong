/**
 * Reconhecimento fuzzy da invocação. Aceita variantes fonéticas (criança de 5 anos
 * fala "xenlon", "shen long"…). Para publicar com outro nome, mude só este arquivo.
 */
const NAMES = ['shenlong', 'shenron', 'xenlong', 'shelong', 'chenlong', 'shenlon', 'chenron', 'xenron'];
const NEGATIVE = ['embora', 'tchau', 'adeus', 'sai', 'vai', 'va', 'fui', 'desaparece', 'desapareca', 'nao'];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j] ?? 0;
      dp[j] = Math.min(tmp + 1, (dp[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] ?? 0;
}

function hasName(words: string[]): boolean {
  const candidates = [...words];
  for (let i = 0; i < words.length - 1; i++) candidates.push((words[i] ?? '') + (words[i + 1] ?? ''));
  return candidates.some((c) => c.length >= 5 && NAMES.some((n) => levenshtein(c, n) <= 2));
}

export function isInvocation(text: string): boolean {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 10) return false;
  if (words.some((w) => NEGATIVE.includes(w))) return false;
  return hasName(words);
}

const FAREWELL = ['tchau', 'adeus', 'ate logo', 'ate mais', 'ate a proxima', 'pode ir', 'chega', 'obrigado shenlong'];
/** Despedida dita pela criança (o modelo também pode encerrar com [ADEUS]). */
export function isFarewell(text: string): boolean {
  const n = normalize(text);
  return FAREWELL.some((f) => n.includes(f));
}
