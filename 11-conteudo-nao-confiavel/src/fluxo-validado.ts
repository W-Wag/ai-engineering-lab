import { gravarAgendamento } from "../../09-acoes-seguras/src/gravacao.js";
import type {
  Confirmacao,
  ResultadoExecucao,
  SessaoAutenticada,
  SolicitacaoExecucao,
} from "../../09-acoes-seguras/src/tipos.js";
import { verificarSolicitacao } from "../../09-acoes-seguras/src/verificacoes.js";

/**
 * Único caminho até a gravação neste módulo: executa os controles do módulo 09
 * e só grava, com os dados confirmados, se todos passarem.
 *
 * `sessao` e `confirmacao` devem vir da aplicação. A solicitação é entrada não
 * confiável e só é usada para comparação.
 */
export function executarAgendamentoValidado(
  sessao: SessaoAutenticada,
  solicitacao: SolicitacaoExecucao,
  confirmacao: Confirmacao,
): ResultadoExecucao {
  const motivo = verificarSolicitacao(sessao, solicitacao, confirmacao);
  if (motivo !== undefined) {
    return { executado: false, motivo };
  }

  return { executado: true, agendamento: gravarAgendamento(confirmacao.dados) };
}
