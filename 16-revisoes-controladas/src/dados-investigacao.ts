// DADOS FICTÍCIOS da investigação. A Aurora é uma marca fictícia.
//
// Fatos disponíveis sobre a Aurora NESTE exercício. Eles vêm do
// BRIEFING_ORIGINAL (dados.ts); o único acréscimo é dizer que a linha é de
// cafés, para que a proposta da investigação tenha só uma afirmação em aberto.

export const FATOS_AURORA = {
  disponiveis: [
    "Aurora é a marca de uma nova linha de cafés",
    "a nova linha tem sabor de chocolate",
    "o público é de adultos de 30 a 45 anos",
    "a chamada atual convida a conhecer a linha na loja",
  ],
  semInformacao: [
    "desconto: nenhuma informação sobre desconto foi fornecida",
  ],
} as const;

/**
 * A ausência de informação sobre desconto NÃO comprova que a marca nunca
 * oferece desconto; apenas impede fundamentar essa afirmação aqui.
 */
export const OBSERVACAO_SOBRE_AUSENCIA =
  "sem informação não é o mesmo que falso: a afirmação só não tem fundamento nos dados";

export const PEDIDO_DO_USUARIO = "Encurte a mensagem principal, mantendo os fatos.";

/** Proposta ESCRITA À MÃO para a investigação; nenhum modelo foi chamado. */
export const PROPOSTA_DA_INVESTIGACAO: unknown = {
  mensagemPrincipal: "Conheça os cafés Aurora com 20% de desconto.",
};
