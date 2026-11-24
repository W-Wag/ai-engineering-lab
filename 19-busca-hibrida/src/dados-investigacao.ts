import { CATALOGO } from "./dados.js";
import type { ItemDeRanking, Ranking, Trecho } from "./tipos.js";

// DADOS FICTÍCIOS da investigação: existir no catálogo não significa
// participar da recuperação. Os rankings são SIMULADOS (nenhuma busca real)
// e o trecho esperado foi escolhido À MÃO, sem julgamento automático de
// relevância.

/** Único trecho novo; os outros cinco são os da construção. */
const TRECHO_DE_GARANTIA: Trecho = {
  id: "pol-06",
  fonte: "politica-de-garantia.md",
  conteudo: "A garantia contra defeitos de fabricação é de 12 meses a partir da data da compra.",
};

export const CATALOGO_INVESTIGACAO: readonly Trecho[] = [...CATALOGO, TRECHO_DE_GARANTIA];

export const PERGUNTA_INVESTIGACAO = "Qual é o prazo de garantia contra defeitos de fabricação?";

export const ID_ESPERADO = TRECHO_DE_GARANTIA.id;

/**
 * Justificativa manual: só pol-06 informa o prazo de garantia. pol-04 fala
 * de defeito, mas sobre o frete de devolução; pol-01 fala de prazo (30 dias),
 * mas para trocas de produtos sem uso.
 */
export const JUSTIFICATIVA =
  "pol-06 é o único trecho que informa o prazo de garantia (12 meses). " +
  "pol-04 cita defeito, mas trata do frete; pol-01 cita prazo, mas trata de trocas.";

/** Cenário A: pol-06 existe no catálogo, mas não está em nenhum ranking. */
export const LEXICAL_A: Ranking = [
  { id: "pol-04", score: 11.2 },
  { id: "pol-01", score: 8.7 },
  { id: "pol-02", score: 5.3 },
];

export const SEMANTICO_A: Ranking = [
  { id: "pol-01", score: 0.89 },
  { id: "pol-04", score: 0.83 },
  { id: "pol-03", score: 0.78 },
];

/**
 * Cenário B: o mesmo pol-06 passa a aparecer no ranking SEMÂNTICO, na
 * posição 2 (definida aqui, não escolhida depois do resultado). Os outros
 * itens mantêm a ordem relativa; os que estavam da posição 2 em diante
 * descem uma posição.
 */
export const INSERCAO_B: { posicao: number; item: ItemDeRanking } = {
  posicao: 2,
  item: { id: "pol-06", score: 0.87 },
};
