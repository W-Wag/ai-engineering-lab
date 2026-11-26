import type { Banco } from "./banco.js";
import { criarLimiteDeConcorrencia, criarLimiteDeTaxa } from "./limites.js";
import type { Processar } from "./processador.js";
import {
  TodoPendente,
  type ConfiguracaoDoConsumidor,
  type Tarefa,
} from "./tipos.js";

// EXERCÍCIO, parte 3: o consumidor da fila.
//
// Concorrência ASSÍNCRONA dentro de UM processo: várias tarefas ficam em
// andamento ao mesmo tempo porque cada processamento é um `await` de
// timer, não porque há threads ou processos paralelos.

export type DependenciasDoConsumidor = {
  banco: Banco;
  processar: Processar;
  /** adquirirProxima (TODO 1), envolvida pela instrumentação. */
  adquirir: (banco: Banco, executor: string) => Tarefa | null;
  /** processarTarefa (TODO 2). */
  processarTarefa: (
    banco: Banco,
    processar: Processar,
    tarefa: Tarefa,
  ) => Promise<void>;
};

/**
 * Consome a fila até não haver tarefa pendente E nenhuma em andamento.
 * Não use Promise.all sobre todas as pendentes como forma de controle.
 */
export async function consumirFila(
  deps: DependenciasDoConsumidor,
  config: ConfiguracaoDoConsumidor,
): Promise<void> {
  const concorrencia = criarLimiteDeConcorrencia(config.maxConcorrencia);
  const taxa = criarLimiteDeTaxa(config.intervaloMinimoMs);

  // TODO 5: integre os controles no laço de consumo: respeite a vaga de
  // concorrência e a vez do rate limit antes de iniciar cada processamento,
  // adquira a tarefa, dispare o processamento sem bloquear o laço, devolva a
  // vaga quando ele terminar e só encerre quando não houver mais pendentes
  // nem processamentos em andamento.
  const consumidor = new Set<Promise<void>>();

  while (true) {
    await concorrencia.ocupar();
    await taxa.aguardarVez();
    const tarefa = deps.adquirir(deps.banco, config.executor);
    if (!tarefa) {
      concorrencia.liberar();
      break;
    }

    const processamento = deps
      .processarTarefa(deps.banco, deps.processar, tarefa)
      .finally(() => {
        concorrencia.liberar();
        consumidor.delete(processamento);
      });

    consumidor.add(processamento);
  }

  await Promise.all(consumidor);
}
