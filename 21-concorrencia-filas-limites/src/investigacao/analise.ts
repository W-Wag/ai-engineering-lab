import { TodoPendente } from "../tipos.js";
import type { EventoInv } from "./comum.js";

// EXERCÍCIO da investigação: as análises ficam com você.
//
// Entrada: os eventos dos DOIS executores de uma rodada, juntos e ordenados
// por tempo. Campos úteis: executor, pid, tipo, tarefaId, detalhe.
// Tipos relevantes:
//   ingênuo: "leitura", "atualizacao" (detalhe = linhas alteradas),
//            "processamento_iniciado"
//   atômico: "tentativa_aquisicao", "aquisicao", "sem_tarefa",
//            "processamento_iniciado"
//
// Não dependa de qual executor vence, e não use o estado final do banco:
// a última gravação pode esconder um processamento duplicado.

export type ResumoDaRodada = {
  /** Quantos executores "adquiriram" (ingênuo: atualização com 1 linha; atômico: aquisicao). */
  aquisicoesBemSucedidas: number;
  /** Quantos processamentos efetivamente começaram. */
  processamentosIniciados: number;
  /** O mesmo ID foi processado por mais de um executor? */
  processamentoDuplicado: boolean;
};

/** Cenário ingênuo: os dois leram e processaram o mesmo ID? */
export function analisarIngenuo(eventos: EventoInv[]): ResumoDaRodada {
  // TODO 1: a partir dos eventos, identifique quais IDs cada executor leu e
  // quais processou, imprima o que encontrou e devolva o resumo.
  const leituras = new Map<string, Set<string>>();
  const saidas = new Map<string, Set<string>>();

  for (const e of eventos) {
    if (!e.tarefaId) continue;
    const mapa =
      e.tipo === "leitura"
        ? leituras
        : e.tipo === "processamento_iniciado"
          ? saidas
          : null;
    if (!mapa) continue;
    const executores = mapa.get(e.tarefaId) ?? new Set<string>();
    executores.add(e.executor);
    mapa.set(e.tarefaId, executores);
  }

  for (const [tarefa, executores] of saidas) {
    console.log(` ${tarefa}: executada pelo ${[...executores].join(", ")}`);
  }
  for (const [tarefa, executores] of leituras) {
    console.log(` ${tarefa}: lida pelo ${[...executores].join(", ")}`);
  }

  return {
    aquisicoesBemSucedidas: eventos.filter(
      (e) => e.tipo === "atualizacao" && e.detalhe === 1,
    ).length,
    processamentosIniciados: eventos.filter(
      (e) => e.tipo === "processamento_iniciado",
    ).length,
    processamentoDuplicado: [...saidas.values()].some((s) => s.size > 1),
  };
}

/** Cenário atômico: só um executor adquiriu e processou? */
export function analisarAtomico(eventos: EventoInv[]): ResumoDaRodada {
  // TODO 2: confira que os dois tentaram, que só um recebeu a tarefa (o
  // outro registrou sem_tarefa) e que só quem recebeu processou. Imprima e
  // devolva o resumo.
  const porTipo = new Map<string, Set<string>>();
  const porTarefa = new Map<string, Set<string>>();

  for (const ev of eventos) {
    const executor = porTipo.get(ev.tipo) ?? new Set<string>();
    executor.add(ev.executor);
    porTipo.set(ev.tipo, executor);

    if (ev.tipo === "processamento_iniciado" && ev.tarefaId) {
      const executores = porTarefa.get(ev.tarefaId) ?? new Set<string>();
      executores.add(ev.executor);
      porTarefa.set(ev.tarefaId, executores);
    }
  }

  const tentaram = porTipo.get("tentativa_aquisicao") ?? new Set<string>();
  const adquiriu = porTipo.get("aquisicao") ?? new Set<string>();
  const semTarefa = porTipo.get("sem_tarefa") ?? new Set<string>();
  const processou = porTipo.get("processamento_iniciado") ?? new Set<string>();

  console.log(` tentaram: ${[...tentaram].join(", ")}`);
  console.log(` adquiriu: ${[...adquiriu].join(", ") || "ninguém"}`);
  console.log(` sem tarefa: ${[...semTarefa].join(", ") || "ninguém"}`);
  console.log(` processado: ${[...processou].join(", ") || "ninguém"}`);
  const soQuemAdquiriu = [...processou].every((x) => adquiriu.has(x));
  console.log(` só quem adquiriu processou? ${soQuemAdquiriu ? "sim" : "NÃO"}`);
  return {
    aquisicoesBemSucedidas: eventos.filter((ev) => ev.tipo === "aquisicao")
      .length,
    processamentosIniciados: eventos.filter(
      (ev) => ev.tipo === "processamento_iniciado",
    ).length,
    processamentoDuplicado: [...porTarefa.values()].some((s) => s.size > 1),
  };
}

/** Compara os resumos das rodadas dos dois cenários. */
export function compararCenarios(
  ingenuo: ResumoDaRodada[],
  atomico: ResumoDaRodada[],
): void {
  // TODO 3: compare aquisições bem-sucedidas e processamentos iniciados
  // entre os cenários, rodada a rodada, e imprima a comparação.

  const total = Math.max(ingenuo.length, atomico.length);
  for (let i = 0; i < total; i++) {
    const ing = ingenuo[i];
    const at = atomico[i];

    const fmt = (r?: ResumoDaRodada) =>
      r
        ? `aquisições bem sucedidas=${r.aquisicoesBemSucedidas} iniciados=${r.processamentosIniciados} duplicou=${r.processamentoDuplicado ? "sim" : "não"}`
        : "(sem dados)";

    console.log(` rodada ${i + 1}: ingênuo ${fmt(ing)} | atomico ${fmt(at)}`);
  }
  const duplas = (lista: ResumoDaRodada[]) =>
    lista.filter((r) => r.processamentoDuplicado).length;
  console.log(
    ` ingênuo gerou em dobro em ${duplas(ingenuo)}/${ingenuo.length}; atômico em ${duplas(atomico)}/${atomico.length}`,
  );
}
