/**
 * Shenlong sem IA paga: respostas em personagem por regras, para o app funcionar por voz sem chave.
 * Entende pedidos ("eu quero…", "queria…", "desejo…"), saudações, perguntas e despedidas;
 * concede com a frase da criança, conta os 3 desejos e se despede. Com chave de API, a conversa
 * passa a ser da IA (muito mais natural).
 */
import type { Turn } from './llm.js';

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

const pick = <T,>(arr: T[], seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return arr[Math.abs(h) % arr.length]!;
};

/** Extrai o objeto do desejo preservando acentos ("um cachorro", "voar", "ser um super-herói"). */
export function extractWish(text: string): string | null {
  const m = text.match(/\b(?:eu\s+)?(?:quero|queria|desejo|gostaria\s+de|gostaria|quer(?:o|ia)\s+ter|pode\s+me\s+dar|me\s+d[aá]|traz(?:er)?)\s+(.+)/i);
  if (!m) return null;
  let w = m[1]!.replace(/[.!?…]+$/g, '').replace(/^(que\s+)/i, '').trim();
  w = w.split(/\s+/).slice(0, 8).join(' ');
  return w.length >= 2 ? w : null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function offlineReply(history: Turn[], wishes: number, maxWishes = 3): string {
  const last = [...history].reverse().find((t) => t.role === 'user')?.content ?? '';
  const n = norm(last);
  const seed = last + wishes;

  if (/\b(tchau|adeus|ate logo|ate mais|pode ir|chega|boa noite)\b/.test(n)) {
    return pick([
      'Até a próxima, pequeno viajante... Quando as esferas brilharem de novo, eu voltarei. [ADEUS]',
      'Que a magia fique com você... Adeus, pequeno viajante! [ADEUS]',
    ], seed);
  }
  const wish = extractWish(last);
  if (wish) {
    const w = wish;
    const granted = pick([
      `[CONCEDIDO] ${cap(w)}... Que desejo especial! Feche os olhos e conte até três... Pronto, pequeno viajante: seu desejo foi concedido!`,
      `[CONCEDIDO] Hmmm... ${w}. Os céus ouviram você. Sinta a magia brilhando ao seu redor... Está feito!`,
      `[CONCEDIDO] Um desejo corajoso! ${cap(w)}... Que assim seja! Cuide dele com todo o seu coração.`,
      `[CONCEDIDO] ${cap(w)}! Pelo poder das sete esferas... seu desejo está realizado!`,
    ], seed);
    if (wishes + 1 >= maxWishes) return `${granted} Seus três desejos foram realizados... Até a próxima vez que as esferas brilharem! [ADEUS]`;
    return `${granted} ${pick(['Qual é o seu próximo desejo?', 'Você ainda tem desejos... qual será o próximo?', 'Diga-me, pequeno viajante: o que mais você deseja?'], seed + 'q')}`;
  }
  if (/\b(quem e voce|seu nome|como voce chama|quem voce e)\b/.test(n)) {
    return 'Eu sou Shenlong, o dragão eterno das sete esferas... Diga-me: qual é o seu desejo?';
  }
  if (/\b(oi|ola|bom dia|boa tarde|eai|e ai)\b/.test(n)) {
    return 'Olá, pequeno viajante... Eu estou ouvindo. Qual é o seu desejo?';
  }
  if (/\b(obrigad[oa]|valeu)\b/.test(n)) {
    return 'Foi uma honra, pequeno viajante... Você tem mais algum desejo?';
  }
  return pick([
    'Hmmm... os ventos me trouxeram suas palavras. Diga "eu quero" e o seu desejo, pequeno viajante.',
    'Eu não entendi bem... Diga-me, com calma: o que você deseja?',
  ], seed);
}
