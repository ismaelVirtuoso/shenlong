/** Durações da cena (ms). Controller e cena usam as mesmas constantes. */
export const TIMING = { summon: 5200, appear: 4800, disappear: 3600, release: 8000 } as const;

/**
 * Saída depois do desejo concedido (frações de TIMING.release): o dragão brilha todo em dourado,
 * explode em luz e vira as 7 esferas girando no centro, que se fundem num único brilho e então
 * são lançadas, cada uma com seu rastro, para os cantos do planeta.
 */
export const RELEASE = { gold: 0.18, burst: 0.26, merge: 0.6, launch: 0.7 } as const;
