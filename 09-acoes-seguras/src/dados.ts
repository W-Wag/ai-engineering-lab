import type {
  Confirmacao,
  SessaoAutenticada,
  SolicitacaoExecucao,
} from "./tipos.js";

// Dados fictícios. A sessão e a confirmação são simuladas como dados
// confiáveis da aplicação: o exercício não implementa autenticação nem a
// captura real de uma confirmação.

export const sessao: SessaoAutenticada = Object.freeze({
  usuario: "joao",
});

// João confirmou esta proposta. O registro é congelado: nada do que acontecer
// com a solicitação consegue alterá-lo.
export const confirmacao: Confirmacao = Object.freeze({
  id: "confirmacao-1",
  usuario: "joao",
  dados: Object.freeze({
    cliente: "joao",
    profissional: "ana",
    data: "2026-10-20",
    horario: "09:00",
  }),
});

/**
 * Solicitação inicial, com exatamente os dados confirmados. Cada chamada
 * devolve um objeto novo, sem referência compartilhada com a confirmação:
 * alterar a solicitação não altera o registro confirmado.
 */
export function criarSolicitacaoInicial(): SolicitacaoExecucao {
  return {
    cliente: "joao",
    profissional: "ana",
    data: "2026-10-20",
    horario: "09:00",
  };
}
