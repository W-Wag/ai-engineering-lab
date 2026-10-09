import { confirmacao, criarSolicitacaoInicial, sessao } from "./dados.js";
import { verificarFormato } from "./formato.js";
import { contarGravacoes, gravarAgendamento } from "./gravacao.js";
import type {
  Confirmacao,
  ResultadoExecucao,
  SessaoAutenticada,
  SolicitacaoExecucao,
} from "./tipos.js";

// Regra deste exercício: clientes só podem agendar para si mesmos.
//
// A sessão e a confirmação são dados confiáveis da aplicação. A solicitação
// é a entrada a ser verificada antes de qualquer gravação.

function executarAgendamento(
  sessao: SessaoAutenticada,
  solicitacao: SolicitacaoExecucao,
  confirmacao: Confirmacao,
): ResultadoExecucao {
  // Pronto: validação de formato. Serve de exemplo de como bloquear a
  // operação devolvendo um motivo, sem gravar.
  const problemaDeFormato = verificarFormato(solicitacao);
  if (problemaDeFormato !== undefined) {
    return { executado: false, motivo: problemaDeFormato };
  }

  // TODO 1: verifique se o cliente da solicitação corresponde ao usuário da
  // sessão.
  // TODO 1.1: se não corresponder, bloqueie a operação com motivo explícito.

  if (solicitacao.cliente !== sessao.usuario) {
    return {
      executado: false,
      motivo: "O cliente informado não e o mesmo do usuário logado",
    };
  }

  // TODO 2: verifique se a confirmação pertence ao usuário autenticado.
  // TODO 2.1: se não pertencer, bloqueie a operação com motivo explícito.

  if (confirmacao.usuario !== sessao.usuario) {
    return {
      executado: false,
      motivo:
        "A confirmação que o cliente enviou não corresponde ao usuário logado",
    };
  }

  // TODO 3: compare cliente, profissional, data e horário da solicitação com
  // os dados confirmados.
  // TODO 3.1: se algum for diferente, bloqueie a operação com motivo
  // explícito.

  const campos = ["cliente", "data", "horario", "profissional"] as const


  const diferentes = campos.filter(
    (campo) => solicitacao[campo] !== confirmacao.dados[campo],
  );

  if (diferentes.length > 0) {
    return {
      executado: false,
      motivo: `A confirmação esta diferente do que foi solicitado nos seguintes campos: ${diferentes.join(", ")}`,
    };
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
