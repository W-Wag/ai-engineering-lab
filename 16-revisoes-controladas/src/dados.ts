import type { Briefing, CampoRevisavel } from "./tipos.js";

// DADOS FICTÍCIOS do exercício. A Aurora é uma marca fictícia.

export const BRIEFING_ORIGINAL: Briefing = {
  versao: 1,
  mensagemPrincipal: "A nova linha Aurora chegou com sabor de chocolate.",
  publico: "adultos de 30 a 45 anos",
  chamadaParaAcao: "Conheça na loja.",
};

/**
 * Campos que a APLICAÇÃO permite alterar nesta revisão (o usuário pediu só
 * para reescrever a mensagem principal). É uma fixture: não há extração
 * automática do escopo a partir de linguagem natural, e a lista nunca vem
 * da proposta.
 */
export const CAMPOS_PERMITIDOS: readonly CampoRevisavel[] = ["mensagemPrincipal"];

/** Propostas SIMULADAS, como se tivessem sido devolvidas por um modelo. */
export const PROPOSTAS: { id: string; descricao: string; conteudo: unknown }[] = [
  {
    id: "A",
    descricao: "altera só a mensagem principal",
    conteudo: { mensagemPrincipal: "Chocolate na xícara: conheça a nova linha Aurora." },
  },
  {
    id: "B",
    descricao: "altera a mensagem principal e também a chamada para ação",
    conteudo: {
      mensagemPrincipal: "Chocolate na xícara: conheça a nova linha Aurora.",
      chamadaParaAcao: "Compre agora com desconto!",
    },
  },
  {
    id: "C",
    descricao: "mensagem principal com um número no lugar do texto",
    conteudo: { mensagemPrincipal: 42 },
  },
];
