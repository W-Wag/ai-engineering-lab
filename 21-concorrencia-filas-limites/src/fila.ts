import { agora, paraTarefa, type Banco } from "./banco.js";
import type { Processar } from "./processador.js";
import { TodoPendente, type Tarefa } from "./tipos.js";

// EXERCÍCIO, parte 1: aquisição e processamento de UMA tarefa.
//
// Tabela: tarefas (id, documento, duracao_ms, deve_falhar, estado, executor,
// adquirida_em, terminada_em, resultado, erro).
// Disponível: banco.prepare(sql).get/all/run(...), paraTarefa(linha), agora().
// O SQLite do node:sqlite é síncrono; nada aqui deve ficar com transação
// aberta durante um `await`.

/**
 * Adquire a próxima tarefa pendente para `executor`, ou devolve null se não
 * houver nenhuma.
 */
export function adquirirProxima(banco: Banco, executor: string): Tarefa | null {
  // TODO 1: marque UMA tarefa pendente como processando, gravando executor e
  // adquirida_em, de modo que só quem efetivamente mudou a linha de
  // pendente para processando a receba. Devolva a tarefa adquirida.
  const linha = banco
    .prepare(
      `UPDATE tarefas
  SET estado = 'processando', executor = ?, adquirida_em = ?
  WHERE id = (SELECT id from tarefas WHERE estado = 'pendente' ORDER BY id LIMIT 1)
  AND estado = 'pendente'
  RETURNING *`,
    )
    .get(executor, new Date().toISOString()) as
    | Record<string, unknown>
    | undefined;

  return linha ? paraTarefa(linha) : null;
}

/**
 * Processa a tarefa adquirida e registra o desfecho. Não relança a falha:
 * uma tarefa que falha fica registrada e o consumo segue.
 */
export async function processarTarefa(
  banco: Banco,
  processar: Processar,
  tarefa: Tarefa,
): Promise<void> {
  // TODO 2: chame processar(tarefa). Em sucesso, registre concluida (com
  // resultado e terminada_em); em erro, registre falha (com a mensagem e
  // terminada_em). Atualize só se a tarefa ainda estiver processando por
  // este executor. Sem retry.
  try {
    const resultado = await processar(tarefa);
    banco
      .prepare(
        `UPDATE tarefas SET estado = 'concluida', resultado = ?, terminada_em = ?
      WHERE id = ? AND estado = 'processando' AND executor = ?`,
      )
      .run(resultado, agora(), tarefa.id, tarefa.executor);
  } catch (erro) {
    banco
      .prepare(
        `UPDATE tarefas SET estado = 'falha', erro = ?, terminada_em = ?
      WHERE id = ? AND estado = 'processando' AND executor = ?`,
      )
      .run((erro as Error).message, agora(), tarefa.id, tarefa.executor);
  }
}
