// Tipos do exercício. Nenhuma busca real acontece aqui: os rankings de
// entrada são fixtures SIMULADAS.

/** Trecho do catálogo de políticas (fictício). */
export type Trecho = {
  id: string;
  fonte: string;
  conteudo: string;
};

/**
 * Um item de ranking, na ordem em que a busca o devolveu. O `score` é o da
 * busca de origem (lexical ou semântica): aparece só para comparação e NÃO
 * entra no cálculo do RRF, que usa apenas a posição.
 */
export type ItemDeRanking = {
  id: string;
  score: number;
};

/** Ranking ordenado: o primeiro item é a posição 1. */
export type Ranking = readonly ItemDeRanking[];

/**
 * Resultado da fusão para um trecho. Uma contribuição é 0 quando o trecho
 * não aparece naquela lista. `pontuacao` = lexical + semântica.
 */
export type ResultadoRrf = {
  id: string;
  contribuicaoLexical: number;
  contribuicaoSemantica: number;
  pontuacao: number;
};
