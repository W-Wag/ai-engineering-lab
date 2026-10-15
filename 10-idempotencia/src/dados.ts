import {
  criarSolicitacaoInicial,
} from "../../09-acoes-seguras/src/dados.js";
import type { Confirmacao, SolicitacaoExecucao } from "../../09-acoes-seguras/src/tipos.js";
import type { SolicitacaoIdempotente } from "./tipos.js";

// A sessão (joao) e a confirmação (joao com ana, 2026-10-20, 09:00) são as do
// módulo 09, simuladas como dados confiáveis da aplicação.
export { confirmacao, sessao } from "../../09-acoes-seguras/src/dados.js";

/** Chave fictícia e fixa para a operação de agendamento deste cenário. */
export const CHAVE_AGENDAMENTO = "agendamento-joao-001";

// Investigação do conflito: João também confirmou uma proposta às 14:00. Com
// solicitação e confirmação concordando, o pedido passa nas verificações do
// módulo 09 e chega à comparação com o registro da chave.
export const confirmacaoConflito: Confirmacao = Object.freeze({
  id: "confirmacao-conflito-1",
  usuario: "joao",
  dados: Object.freeze({
    cliente: "joao",
    profissional: "ana",
    data: "2026-10-20",
    horario: "14:00",
  }),
});

export function criarSolicitacaoInicialConflito(): SolicitacaoExecucao {
  return {
    cliente: "joao",
    profissional: "ana",
    data: "2026-10-20",
    horario: "14:00",
  };
}

/**
 * Solicitação com os dados confirmados e a chave fixa. Cada chamada devolve um
 * objeto novo, sem referência compartilhada com a confirmação nem com
 * solicitações anteriores.
 */
export function criarSolicitacaoComChave(
  conflito?: true,
): SolicitacaoIdempotente {
  const criarSolicitacao = conflito
    ? criarSolicitacaoInicialConflito
    : criarSolicitacaoInicial;
  return {
    ...criarSolicitacao(),
    chaveIdempotencia: CHAVE_AGENDAMENTO,
  };
}
