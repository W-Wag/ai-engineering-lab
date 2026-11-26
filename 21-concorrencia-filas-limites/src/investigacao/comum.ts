import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Infraestrutura da INVESTIGAÇÃO (dois processos, um banco). Nada aqui é
// usado pela construção normal.

export type Cenario = "ingenuo" | "atomico";

export type TipoDeEventoInv =
  | "inicio" //                    processo no ar, com o caminho do banco
  | "barreira_inicio" //           os dois processos estão prontos
  | "largada" //                   instante comum de partida (detalhe = epoch ms)
  | "leitura" //                   (ingênuo) SELECT encontrou esta tarefa pendente
  | "barreira_leitura" //          (ingênuo) os dois já leram; só agora pode atualizar
  | "atualizacao" //               (ingênuo) UPDATE incondicional por ID; detalhe = linhas alteradas
  | "tentativa_aquisicao" //       (atômico) vai chamar adquirirProxima
  | "aquisicao" //                 (atômico) adquirirProxima devolveu esta tarefa
  | "sem_tarefa" //                (atômico) adquirirProxima devolveu null
  | "processamento_iniciado" //    o processador começou a processar esta tarefa
  | "processamento_concluido"
  | "erro"; //                     qualquer erro inesperado (a investigação falha)

export type EventoInv = {
  t: number; //      Date.now() (mesmo relógio da máquina para os dois processos)
  pid: number;
  executor: string;
  cenario: Cenario;
  tipo: TipoDeEventoInv;
  tarefaId?: string;
  detalhe?: string | number;
};

/** Cada processo escreve os próprios eventos num arquivo JSONL só dele. */
export function arquivoDeEventos(pasta: string, executor: string): string {
  return join(pasta, `eventos-${executor}.jsonl`);
}

export function registrar(pasta: string, evento: EventoInv): void {
  appendFileSync(arquivoDeEventos(pasta, evento.executor), `${JSON.stringify(evento)}\n`);
}

export function lerEventos(pasta: string, executor: string): EventoInv[] {
  const arquivo = arquivoDeEventos(pasta, executor);
  if (!existsSync(arquivo)) return [];
  return readFileSync(arquivo, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EventoInv);
}

// ---------- Barreira entre processos (arquivos numa pasta compartilhada) ----------

/** Marca que `executor` chegou à barreira `nome` (grava o instante da chegada). */
export function chegar(pasta: string, nome: string, executor: string): void {
  writeFileSync(join(pasta, `barreira-${nome}-${executor}`), String(Date.now()));
}

/**
 * Espera até todos os `executores` chegarem à barreira `nome` e devolve o
 * instante de chegada de cada um.
 */
export async function aguardarTodos(
  pasta: string,
  nome: string,
  executores: string[],
  limiteMs = 10_000,
): Promise<number[]> {
  const inicio = Date.now();
  const arquivo = (e: string) => join(pasta, `barreira-${nome}-${e}`);
  while (!executores.every((e) => existsSync(arquivo(e)))) {
    if (Date.now() - inicio > limiteMs) throw new Error(`barreira "${nome}" não foi alcançada por todos em ${limiteMs} ms`);
    await new Promise((r) => setTimeout(r, 2));
  }
  return executores.map((e) => Number(readFileSync(arquivo(e), "utf8")));
}

/**
 * Largada comum: os dois processos calculam o MESMO instante (a última
 * chegada + 100 ms) e esperam ocupados até ele. Sem isso, um processo pode
 * acordar da barreira ~15 ms depois do outro (resolução do timer no
 * Windows) e a "disputa" vira uma fila.
 */
export function aguardarLargada(chegadas: number[], folgaMs = 100): number {
  const largada = Math.max(...chegadas) + folgaMs;
  while (Date.now() < largada) {
    /* espera ocupada proposital, para alinhar os dois processos */
  }
  return largada;
}
