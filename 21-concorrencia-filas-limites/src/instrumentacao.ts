// Instrumentação (infraestrutura). Registra, com tempo relativo ao início
// da execução, cada aquisição, início, término e falha, e acompanha quantas
// tarefas estão em processamento AGORA e o pico observado.
//
// Quem mede é o processador simulado e o invólucro da aquisição, não o
// código dos TODOs: o pico e os horários de início são observados por fora
// dos limitadores que você vai implementar.

export type TipoDeEvento = "adquirida" | "iniciada" | "concluida" | "falhou";

export type Evento = { t: number; tipo: TipoDeEvento; tarefaId: string; executor?: string; ativos: number };

export function criarInstrumentacao() {
  const origem = performance.now();
  const estado = {
    eventos: [] as Evento[],
    ativos: 0,
    pico: 0,
    /** Tempo relativo (ms) de cada início de processamento, em ordem. */
    inicios: [] as { t: number; tarefaId: string }[],
  };
  const t = () => Math.round((performance.now() - origem) * 10) / 10;

  return {
    estado,
    adquirida(tarefaId: string, executor: string) {
      estado.eventos.push({ t: t(), tipo: "adquirida", tarefaId, executor, ativos: estado.ativos });
    },
    iniciou(tarefaId: string) {
      estado.ativos++;
      estado.pico = Math.max(estado.pico, estado.ativos);
      const agora = t();
      estado.inicios.push({ t: agora, tarefaId });
      estado.eventos.push({ t: agora, tipo: "iniciada", tarefaId, ativos: estado.ativos });
    },
    terminou(tarefaId: string, ok: boolean) {
      estado.ativos--;
      estado.eventos.push({ t: t(), tipo: ok ? "concluida" : "falhou", tarefaId, ativos: estado.ativos });
    },
  };
}

export type Instrumentacao = ReturnType<typeof criarInstrumentacao>;
