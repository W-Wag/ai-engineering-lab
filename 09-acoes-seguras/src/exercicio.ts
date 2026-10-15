import { confirmacao, criarSolicitacaoInicial, sessao } from "./dados.js";
import { contarGravacoes, gravarAgendamento } from "./gravacao.js";
import type {
  Confirmacao,
  ResultadoExecucao,
  SessaoAutenticada,
  SolicitacaoExecucao,
} from "./tipos.js";
import { verificarSolicitacao } from "./verificacoes.js";

// As verificações implementadas neste exercício estão em verificacoes.ts,
// para serem reutilizadas pelo módulo 10 sem executar este arquivo.

function executarAgendamento(
  sessao: SessaoAutenticada,
  solicitacao: SolicitacaoExecucao,
  confirmacao: Confirmacao,
): ResultadoExecucao {
  const motivo = verificarSolicitacao(sessao, solicitacao, confirmacao);
  if (motivo !== undefined) {
    return { executado: false, motivo };
  }

  // TODO 4: chame gravarAgendamento somente depois de todas as verificações
  // passarem e devolva o resultado da execução. Substitua o retorno abaixo.

  const agendamento = gravarAgendamento(confirmacao.dados);
  return { executado: true, agendamento: agendamento };
}

function main(): void {
  const solicitacao = criarSolicitacaoInicial();

  console.log("Sessão:", sessao);
  console.log("Confirmação registrada:", confirmacao);
  console.log("Solicitação:", solicitacao);

  const resultado = executarAgendamento(sessao, solicitacao, confirmacao);

  // TODO 5: exiba o resultado e a quantidade de gravações (contarGravacoes).

  console.log("Resultado da execução do agendamento: ", resultado);
  console.log("Quantidade de gravações: ", contarGravacoes());
}

main();
