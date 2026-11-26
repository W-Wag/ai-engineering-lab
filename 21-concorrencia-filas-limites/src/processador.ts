import type { Instrumentacao } from "./instrumentacao.js";
import type { Tarefa } from "./tipos.js";

// Processador SIMULADO de documentos "por IA": espera a duração conhecida
// da tarefa e devolve um resumo fixo. Nenhum modelo, nenhuma rede.
// Tarefas com deveFalhar = true lançam ErroDeProcessamento depois da espera.

export class ErroDeProcessamento extends Error {}

/** Espera `ms` milissegundos (utilitário assíncrono). */
export const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function criarProcessador(instr: Instrumentacao) {
  return async function processar(tarefa: Tarefa): Promise<string> {
    instr.iniciou(tarefa.id);
    let ok = false;
    try {
      await esperar(tarefa.duracaoMs);
      if (tarefa.deveFalhar) throw new ErroDeProcessamento(`documento ilegível: ${tarefa.id}`);
      ok = true;
      return `Resumo simulado de "${tarefa.documento}"`;
    } finally {
      instr.terminou(tarefa.id, ok);
    }
  };
}

export type Processar = ReturnType<typeof criarProcessador>;
