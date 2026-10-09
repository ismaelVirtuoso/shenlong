/** Filtros simples de entrada/saída (defesa em profundidade; a camada principal é o prompt). */
const BAD = [
  'matar', 'morrer', 'morte', 'suicid', 'sangue', 'arma', 'faca', 'revolver', 'pistola', 'bomba',
  'sexo', 'pelad', 'porn', 'droga', 'cocaina', 'maconha', 'puta', 'porra', 'caralho', 'merda', 'foder',
  'estuprar', 'nazi',
];

const norm = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const isUnsafe = (text: string) => {
  const n = norm(text);
  return BAD.some((b) => new RegExp(`\\b${b}`).test(n));
};

export const REDIRECT_INPUT =
  'Hmm... isso são sombras que eu prefiro não chamar. Vamos fazer um desejo bonito, pequeno viajante? O que faria seu coração sorrir?';
export const SAFE_OUTPUT = 'Os ventos mudaram de direção... Diga-me outro desejo, algo que faça seu coração sorrir.';
