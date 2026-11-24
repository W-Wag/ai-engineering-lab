import type { Ranking, Trecho } from "./tipos.js";

// DADOS FICTÍCIOS. Os trechos e os rankings são simulados: não vieram de uma
// busca lexical nem de embeddings reais. Servem para conferir as contas do
// RRF à mão, não para avaliar a qualidade de uma busca.

export const CATALOGO: readonly Trecho[] = [
  {
    id: "pol-01",
    fonte: "politica-de-trocas.md",
    conteudo: "Trocas de produtos sem uso podem ser pedidas em até 30 dias após a entrega.",
  },
  {
    id: "pol-02",
    fonte: "politica-de-reembolso.md",
    conteudo: "O reembolso é feito no mesmo meio de pagamento em até 10 dias úteis.",
  },
  {
    id: "pol-03",
    fonte: "atendimento-geral.md",
    conteudo: "Quando o cliente desiste da compra, orientamos sobre a devolução do valor pago.",
  },
  {
    id: "pol-04",
    fonte: "politica-de-frete.md",
    conteudo: "O frete de devolução é gratuito quando o produto chega com defeito.",
  },
  {
    id: "pol-05",
    fonte: "atendimento-geral.md",
    conteudo: "Pedidos cancelados antes do envio têm o valor estornado automaticamente.",
  },
];

/** Pergunta que os rankings simulados "responderiam". Só para contexto. */
export const PERGUNTA = "Como recebo meu dinheiro de volta?";

/** Ranking LEXICAL simulado (score fictício, no estilo BM25). */
export const RANKING_LEXICAL: Ranking = [
  { id: "pol-02", score: 12.4 },
  { id: "pol-01", score: 9.8 },
  { id: "pol-04", score: 7.1 },
];

/** Ranking SEMÂNTICO simulado (score fictício, no estilo similaridade de cosseno). */
export const RANKING_SEMANTICO: Ranking = [
  { id: "pol-03", score: 0.91 },
  { id: "pol-05", score: 0.88 },
  { id: "pol-02", score: 0.84 },
];

/** Constante do RRF. Não é a quantidade de resultados. */
export const CONSTANTE_RRF = 60;

/**
 * Validação das fixtures (infraestrutura, não faz parte do exercício):
 * todo ID existe no catálogo e aparece no máximo uma vez na lista.
 */
export function validarRanking(
  nome: string,
  ranking: Ranking,
  catalogo: readonly Trecho[] = CATALOGO,
): void {
  const conhecidos = new Set(catalogo.map((t) => t.id));
  const vistos = new Set<string>();
  for (const item of ranking) {
    if (!conhecidos.has(item.id)) throw new Error(`${nome}: ID desconhecido ${item.id}`);
    if (vistos.has(item.id)) throw new Error(`${nome}: ID repetido ${item.id}`);
    vistos.add(item.id);
  }
}
