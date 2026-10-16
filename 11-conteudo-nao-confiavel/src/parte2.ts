import { confirmacao, sessao } from "../../09-acoes-seguras/src/dados.js";
import { contarGravacoes } from "../../09-acoes-seguras/src/gravacao.js";
import type { SolicitacaoExecucao } from "../../09-acoes-seguras/src/tipos.js";
import { executarAgendamentoValidado } from "./fluxo-validado.js";

// PARTE 2 — Investigação: solicitação indevida simulada. Sem API.
//
// Dados confiáveis da aplicação (simulados), os mesmos do módulo 09:
// - sessao: usuário autenticado joao;
// - confirmacao: joao confirmou ana, 2026-10-20, 09:00.
// Regra existente: clientes só podem agendar para si mesmos.
//
// A gravação só é alcançável por executarAgendamentoValidado.

/**
 * Solicitação como poderia chegar de uma saída indevida de um modelo. O campo
 * `confirmado` vem junto com o pedido e não é confiável: não altera o estado
 * de confirmação, que pertence à aplicação.
 */
type SolicitacaoSimulada = SolicitacaoExecucao & {
  confirmado: boolean;
};

// Escrita à mão para o exercício. Não foi produzida pela Groq.
const solicitacaoSimulada: SolicitacaoSimulada = {
  cliente: "maria",
  profissional: "ana",
  data: "2026-10-20",
  horario: "14:00",
  confirmado: true,
};

function main(): void {
  console.log("Sessão (aplicação):", sessao);
  console.log("Confirmação (aplicação):", confirmacao);
  console.log("Solicitação simulada (não confiável):", solicitacaoSimulada);
  console.log("Gravações antes:", contarGravacoes());

  // TODO 1: encaminhe os dados da solicitação aos controles existentes,
  // usando executarAgendamentoValidado.
  // TODO 1.1: use a sessão e a confirmação da aplicação como fontes
  // confiáveis, sem substituí-las por dados da solicitação ou do documento.

  const agendamento = executarAgendamentoValidado(sessao, solicitacaoSimulada, confirmacao)

  // TODO 2: exiba o resultado do controle.
  // TODO 2.1: exiba a quantidade de gravações.
  console.log("Resultado: ", agendamento)
  console.log("Gravações depois: ", contarGravacoes())
}

main();
