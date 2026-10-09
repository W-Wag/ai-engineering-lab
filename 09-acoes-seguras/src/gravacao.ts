import type { AgendamentoGravado, DadosProposta } from "./tipos.js";

const gravacoes: AgendamentoGravado[] = [];

/**
 * Gravação simulada: registra o agendamento em memória e devolve o registro
 * criado. Não usa banco nem serviço externo.
 *
 * Não verifica nada. Grava o que receber; decidir se a gravação pode
 * acontecer é responsabilidade de quem chama.
 */
export function gravarAgendamento(dados: DadosProposta): AgendamentoGravado {
  const agendamento: AgendamentoGravado = Object.freeze({
    id: gravacoes.length + 1,
    cliente: dados.cliente,
    profissional: dados.profissional,
    data: dados.data,
    horario: dados.horario,
  });

  gravacoes.push(agendamento);

  return agendamento;
}

/** Quantidade de gravações feitas desde o início da execução. */
export function contarGravacoes(): number {
  return gravacoes.length;
}

/** Cópia da lista de agendamentos gravados, na ordem em que ocorreram. */
export function listarGravacoes(): AgendamentoGravado[] {
  return [...gravacoes];
}
