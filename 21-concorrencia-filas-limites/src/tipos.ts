// Tipos da fila de processamento SIMULADO de documentos. Nenhum modelo real.
//
//   pendente → processando → concluida
//                          ↘ falha       (sem retry automático nesta etapa)

export type EstadoDaTarefa = "pendente" | "processando" | "concluida" | "falha";

export type Tarefa = {
  id: string;
  documento: string;
  /** Duração simulada do processamento, em ms (conhecida de antemão). */
  duracaoMs: number;
  /** Fixture: o processamento desta tarefa falha de propósito. */
  deveFalhar: boolean;
  estado: EstadoDaTarefa;
  /** Quem adquiriu a tarefa; null enquanto pendente. */
  executor: string | null;
  adquiridaEm: string | null;
  terminadaEm: string | null;
  resultado: string | null;
  erro: string | null;
};

/**
 * Limites do consumidor. São LOCAIS: valem para uma chamada de consumirFila
 * dentro de um processo. Outro processo (ou outra chamada) teria os próprios
 * limites; nada aqui é global.
 */
export type ConfiguracaoDoConsumidor = {
  executor: string;
  /** Máximo de tarefas em processamento ao mesmo tempo. */
  maxConcorrencia: number;
  /**
   * Política de rate limiting: cada INÍCIO de processamento acontece pelo
   * menos `intervaloMinimoMs` depois do início anterior (espaçamento fixo).
   * Com 150 ms, no máximo ~6,7 inícios por segundo.
   */
  intervaloMinimoMs: number;
};

export class TodoPendente extends Error {
  constructor(todo: string) {
    super(`TODO ${todo} ainda não implementado`);
  }
}
