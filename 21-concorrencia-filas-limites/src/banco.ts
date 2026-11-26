import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DOCUMENTOS } from "./dados.js";
import type { EstadoDaTarefa, Tarefa } from "./tipos.js";

// SQLite local (node:sqlite, síncrono). As funções daqui só criam, leem e
// populam: a aquisição e o registro de conclusão/falha são TODOs (fila.ts).

export type Banco = DatabaseSync;
type Linha = Record<string, unknown>;

export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const banco = new DatabaseSync(caminho, { timeout: 1000 });
  banco.exec(`
    CREATE TABLE IF NOT EXISTS tarefas (
      id           TEXT PRIMARY KEY,
      documento    TEXT NOT NULL,
      duracao_ms   INTEGER NOT NULL,
      deve_falhar  INTEGER NOT NULL,
      estado       TEXT NOT NULL CHECK (estado IN ('pendente', 'processando', 'concluida', 'falha')),
      executor     TEXT,
      adquirida_em TEXT,
      terminada_em TEXT,
      resultado    TEXT,
      erro         TEXT
    ) STRICT;
  `);
  return banco;
}

/** Insere os documentos fictícios como tarefas pendentes. */
export function popularFila(banco: Banco): void {
  const inserir = banco.prepare(
    "INSERT INTO tarefas (id, documento, duracao_ms, deve_falhar, estado) VALUES (?, ?, ?, ?, 'pendente')",
  );
  for (const d of DOCUMENTOS) inserir.run(d.id, d.documento, d.duracaoMs, d.deveFalhar ? 1 : 0);
}

/** Converte uma linha de `SELECT * FROM tarefas` (ou `RETURNING *`) em Tarefa. */
export function paraTarefa(l: Linha): Tarefa {
  const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(l.id),
    documento: String(l.documento),
    duracaoMs: Number(l.duracao_ms),
    deveFalhar: Number(l.deve_falhar) === 1,
    estado: String(l.estado) as EstadoDaTarefa,
    executor: texto(l.executor),
    adquiridaEm: texto(l.adquirida_em),
    terminadaEm: texto(l.terminada_em),
    resultado: texto(l.resultado),
    erro: texto(l.erro),
  };
}

export function listarTarefas(banco: Banco): Tarefa[] {
  return (banco.prepare("SELECT * FROM tarefas ORDER BY id").all() as Linha[]).map(paraTarefa);
}

export const agora = () => new Date().toISOString();
