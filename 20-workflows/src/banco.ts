import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Estado, Execucao, Finalizacao, Rascunho } from "./tipos.js";

// SQLite local (node:sqlite). As funções daqui só leem e gravam: NENHUMA
// decide o que fazer conforme o estado. Essas decisões ficam em workflow.ts.

export type Banco = DatabaseSync;
type Linha = Record<string, unknown>;

/** Caminho padrão; as verificações usam outro, via BANCO_WORKFLOWS. */
export const CAMINHO_PADRAO = "dados/workflows.db";

export function abrirBanco(caminho: string): Banco {
  mkdirSync(dirname(caminho), { recursive: true });
  const banco = new DatabaseSync(caminho, { enableForeignKeyConstraints: true, timeout: 1000 });
  banco.exec(`
    CREATE TABLE IF NOT EXISTS execucoes (
      id            TEXT PRIMARY KEY,
      tema          TEXT NOT NULL,
      estado        TEXT NOT NULL CHECK (estado IN ('pendente', 'aguardando_aprovacao', 'aprovado', 'concluido')),
      rascunho_id   TEXT,
      criada_em     TEXT NOT NULL,
      atualizada_em TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS rascunhos (
      id          TEXT PRIMARY KEY,
      execucao_id TEXT NOT NULL REFERENCES execucoes(id),
      texto       TEXT NOT NULL,
      criado_em   TEXT NOT NULL
    ) STRICT;

    -- Sem UNIQUE em execucao_id de propósito: se o fluxo repetir uma etapa,
    -- a repetição aparece como linha a mais e pode ser contada.
    CREATE TABLE IF NOT EXISTS finalizacoes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      execucao_id   TEXT NOT NULL REFERENCES execucoes(id),
      rascunho_id   TEXT NOT NULL REFERENCES rascunhos(id),
      resultado     TEXT NOT NULL,
      finalizada_em TEXT NOT NULL
    ) STRICT;
  `);
  return banco;
}

/**
 * Executa `fn` numa transação: COMMIT se terminar, ROLLBACK se lançar.
 * Use só para gravações curtas; nunca para esperar algo (ex.: aprovação).
 */
export function emTransacao<T>(banco: Banco, fn: () => T): T {
  banco.exec("BEGIN IMMEDIATE");
  try {
    const resultado = fn();
    banco.exec("COMMIT");
    return resultado;
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

const agora = () => new Date().toISOString();

// ---------- Execuções ----------

function paraExecucao(l: Linha): Execucao {
  return {
    id: String(l.id),
    tema: String(l.tema),
    estado: String(l.estado) as Estado,
    rascunhoId: l.rascunho_id === null ? null : String(l.rascunho_id),
    criadaEm: String(l.criada_em),
    atualizadaEm: String(l.atualizada_em),
  };
}

export function criarExecucao(banco: Banco, tema: string): Execucao {
  const momento = agora();
  const execucao: Execucao = {
    id: `wf-${randomUUID().slice(0, 8)}`,
    tema,
    estado: "pendente",
    rascunhoId: null,
    criadaEm: momento,
    atualizadaEm: momento,
  };
  banco
    .prepare("INSERT INTO execucoes (id, tema, estado, rascunho_id, criada_em, atualizada_em) VALUES (?, ?, ?, ?, ?, ?)")
    .run(execucao.id, execucao.tema, execucao.estado, null, momento, momento);
  return execucao;
}

export function buscarExecucao(banco: Banco, id: string): Execucao | null {
  const linha = banco.prepare("SELECT * FROM execucoes WHERE id = ?").get(id) as Linha | undefined;
  return linha ? paraExecucao(linha) : null;
}

/** Grava o novo estado (e, se informado, o rascunho vinculado). Não valida transições. */
export function atualizarEstado(banco: Banco, id: string, estado: Estado, rascunhoId?: string): void {
  if (rascunhoId === undefined) {
    banco.prepare("UPDATE execucoes SET estado = ?, atualizada_em = ? WHERE id = ?").run(estado, agora(), id);
  } else {
    banco
      .prepare("UPDATE execucoes SET estado = ?, rascunho_id = ?, atualizada_em = ? WHERE id = ?")
      .run(estado, rascunhoId, agora(), id);
  }
}

// ---------- Rascunhos ----------

export function gravarRascunho(banco: Banco, execucaoId: string, texto: string): Rascunho {
  const rascunho: Rascunho = {
    id: `rs-${randomUUID().slice(0, 8)}`,
    execucaoId,
    texto,
    criadoEm: agora(),
  };
  banco
    .prepare("INSERT INTO rascunhos (id, execucao_id, texto, criado_em) VALUES (?, ?, ?, ?)")
    .run(rascunho.id, execucaoId, texto, rascunho.criadoEm);
  return rascunho;
}

export function buscarRascunho(banco: Banco, id: string): Rascunho | null {
  const l = banco.prepare("SELECT * FROM rascunhos WHERE id = ?").get(id) as Linha | undefined;
  if (!l) return null;
  return { id: String(l.id), execucaoId: String(l.execucao_id), texto: String(l.texto), criadoEm: String(l.criado_em) };
}

// ---------- Finalizações ----------

function paraFinalizacao(l: Linha): Finalizacao {
  return {
    id: Number(l.id),
    execucaoId: String(l.execucao_id),
    rascunhoId: String(l.rascunho_id),
    resultado: String(l.resultado),
    finalizadaEm: String(l.finalizada_em),
  };
}

export function gravarFinalizacao(banco: Banco, execucaoId: string, rascunhoId: string, resultado: string): Finalizacao {
  const finalizadaEm = agora();
  const info = banco
    .prepare("INSERT INTO finalizacoes (execucao_id, rascunho_id, resultado, finalizada_em) VALUES (?, ?, ?, ?)")
    .run(execucaoId, rascunhoId, resultado, finalizadaEm);
  return { id: Number(info.lastInsertRowid), execucaoId, rascunhoId, resultado, finalizadaEm };
}

/** A primeira finalização registrada da execução, ou null. */
export function buscarFinalizacao(banco: Banco, execucaoId: string): Finalizacao | null {
  const l = banco
    .prepare("SELECT * FROM finalizacoes WHERE execucao_id = ? ORDER BY id LIMIT 1")
    .get(execucaoId) as Linha | undefined;
  return l ? paraFinalizacao(l) : null;
}

// ---------- Contagens persistidas (para consultar e verificar) ----------

export function contar(banco: Banco, tabela: "rascunhos" | "finalizacoes", execucaoId: string): number {
  const l = banco.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE execucao_id = ?`).get(execucaoId) as Linha;
  return Number(l.n);
}
