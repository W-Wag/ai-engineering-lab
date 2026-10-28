import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AgendamentoGravado,
  DadosProposta,
} from "../../../09-acoes-seguras/src/tipos.js";
import type { Mensagem } from "./conversas.js";

// SQLite embutido no Node (node:sqlite), síncrono. Um arquivo por backend;
// nenhum servidor de banco. As funções abaixo só leem e gravam: decidir quando
// chamá-las e em que ordem é responsabilidade do fluxo que as usa.

export type Banco = DatabaseSync;

/**
 * Abre o banco e cria o esquema, se ainda não existir. Use ":memory:" para um
 * banco descartável (testes).
 */
export function abrirBanco(caminho: string): Banco {
  if (caminho !== ":memory:") {
    mkdirSync(dirname(caminho), { recursive: true });
  }

  const banco = new DatabaseSync(caminho, {
    enableForeignKeyConstraints: true,
    timeout: 1000,
  });
  banco.exec("PRAGMA journal_mode = WAL;");
  criarEsquema(banco);
  return banco;
}

/**
 * Tabelas do protótipo. CREATE TABLE IF NOT EXISTS: rodar de novo num banco
 * existente não apaga nada. Não há migrações.
 */
export function criarEsquema(banco: Banco): void {
  banco.exec(`
    CREATE TABLE IF NOT EXISTS conversas (
      id          TEXT PRIMARY KEY,
      usuario     TEXT NOT NULL,
      criada_em   TEXT NOT NULL
    ) STRICT;

    -- Histórico enviado ao modelo. "ordem" é a posição dentro da conversa;
    -- "conteudo" é a mensagem inteira em JSON (inclui tool_calls e
    -- tool_call_id), para ser reenviada ao modelo sem perda.
    CREATE TABLE IF NOT EXISTS mensagens (
      conversa_id TEXT    NOT NULL REFERENCES conversas(id),
      ordem       INTEGER NOT NULL,
      conteudo    TEXT    NOT NULL,
      PRIMARY KEY (conversa_id, ordem)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS propostas (
      id              TEXT PRIMARY KEY,
      conversa_id     TEXT NOT NULL REFERENCES conversas(id),
      usuario         TEXT NOT NULL,
      cliente         TEXT NOT NULL,
      profissional    TEXT NOT NULL,
      data            TEXT NOT NULL,
      horario         TEXT NOT NULL,
      -- Chave estável da operação, criada junto com a proposta.
      chave_operacao  TEXT NOT NULL UNIQUE,
      criada_em       TEXT NOT NULL
    ) STRICT;

    -- Domínio simplificado de horários fixos: a restrição impede duas
    -- reservas do mesmo profissional, data e horário. Não trata sobreposição
    -- de intervalos.
    CREATE TABLE IF NOT EXISTS agendamentos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente       TEXT NOT NULL,
      profissional  TEXT NOT NULL,
      data          TEXT NOT NULL,
      horario       TEXT NOT NULL,
      criado_em     TEXT NOT NULL,
      UNIQUE (profissional, data, horario)
    ) STRICT;

    -- Operação concluída. A chave tem escopo de usuário e tipo de operação.
    -- Os dados aprovados ficam guardados para detectar a mesma chave com
    -- outra solicitação. Cada agendamento pertence a uma operação só.
    CREATE TABLE IF NOT EXISTS operacoes (
      usuario         TEXT    NOT NULL,
      tipo_operacao   TEXT    NOT NULL,
      chave           TEXT    NOT NULL,
      cliente         TEXT    NOT NULL,
      profissional    TEXT    NOT NULL,
      data            TEXT    NOT NULL,
      horario         TEXT    NOT NULL,
      agendamento_id  INTEGER NOT NULL UNIQUE REFERENCES agendamentos(id),
      concluida_em    TEXT    NOT NULL,
      PRIMARY KEY (usuario, tipo_operacao, chave)
    ) STRICT;
  `);
}

function agora(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Transações

/**
 * Executa `trabalho` numa transação na mesma conexão: COMMIT se terminar,
 * ROLLBACK se lançar erro (o erro é relançado).
 *
 * `trabalho` precisa ser síncrono. Uma função assíncrona deixaria a
 * transação aberta durante o await (por exemplo, numa chamada à Groq), por
 * isso é recusada. BEGIN IMMEDIATE reserva a escrita desde o início.
 */
export function emTransacao<T>(banco: Banco, trabalho: () => T): T {
  banco.exec("BEGIN IMMEDIATE");
  try {
    const resultado = trabalho();
    if (resultado instanceof Promise) {
      throw new Error("emTransacao não aceita trabalho assíncrono.");
    }
    banco.exec("COMMIT");
    return resultado;
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

/** Verdadeiro se o erro é uma violação de UNIQUE ou PRIMARY KEY do SQLite. */
export function eViolacaoDeUnicidade(erro: unknown): boolean {
  return (
    erro instanceof Error &&
    /UNIQUE constraint failed|PRIMARY KEY/i.test(erro.message)
  );
}

// ---------------------------------------------------------------------------
// Conversas e mensagens

export type ConversaGravada = { id: string; usuario: string };

export function inserirConversa(banco: Banco, conversa: ConversaGravada): void {
  banco
    .prepare("INSERT INTO conversas (id, usuario, criada_em) VALUES (?, ?, ?)")
    .run(conversa.id, conversa.usuario, agora());
}

export function buscarConversa(
  banco: Banco,
  conversaId: string,
): ConversaGravada | undefined {
  const linha = banco
    .prepare("SELECT id, usuario FROM conversas WHERE id = ?")
    .get(conversaId) as ConversaGravada | undefined;
  // node:sqlite devolve objetos sem protótipo; copiar evita surpresas.
  return linha === undefined ? undefined : { ...linha };
}

/** Histórico da conversa, na ordem em que foi gravado. */
export function listarMensagens(banco: Banco, conversaId: string): Mensagem[] {
  const linhas = banco
    .prepare("SELECT conteudo FROM mensagens WHERE conversa_id = ? ORDER BY ordem")
    .all(conversaId) as { conteudo: string }[];
  return linhas.map((linha) => JSON.parse(linha.conteudo) as Mensagem);
}

/**
 * Acrescenta mensagens ao fim do histórico. Use dentro de emTransacao quando
 * várias mensagens precisarem entrar juntas.
 */
export function acrescentarMensagens(
  banco: Banco,
  conversaId: string,
  mensagens: readonly Mensagem[],
): void {
  const { proxima } = banco
    .prepare(
      "SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM mensagens WHERE conversa_id = ?",
    )
    .get(conversaId) as { proxima: number };

  const inserir = banco.prepare(
    "INSERT INTO mensagens (conversa_id, ordem, conteudo) VALUES (?, ?, ?)",
  );
  mensagens.forEach((mensagem, indice) => {
    inserir.run(conversaId, proxima + indice, JSON.stringify(mensagem));
  });
}

// ---------------------------------------------------------------------------
// Propostas

export type PropostaGravada = {
  id: string;
  conversaId: string;
  usuario: string;
  dados: DadosProposta;
  chaveOperacao: string;
};

type LinhaProposta = {
  id: string;
  conversa_id: string;
  usuario: string;
  cliente: string;
  profissional: string;
  data: string;
  horario: string;
  chave_operacao: string;
};

export function inserirProposta(banco: Banco, proposta: PropostaGravada): void {
  banco
    .prepare(
      `INSERT INTO propostas
         (id, conversa_id, usuario, cliente, profissional, data, horario, chave_operacao, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      proposta.id,
      proposta.conversaId,
      proposta.usuario,
      proposta.dados.cliente,
      proposta.dados.profissional,
      proposta.dados.data,
      proposta.dados.horario,
      proposta.chaveOperacao,
      agora(),
    );
}

export function buscarProposta(
  banco: Banco,
  propostaId: string,
): PropostaGravada | undefined {
  const linha = banco
    .prepare("SELECT * FROM propostas WHERE id = ?")
    .get(propostaId) as LinhaProposta | undefined;
  if (linha === undefined) return undefined;

  return {
    id: linha.id,
    conversaId: linha.conversa_id,
    usuario: linha.usuario,
    dados: Object.freeze({
      cliente: linha.cliente,
      profissional: linha.profissional,
      data: linha.data,
      horario: linha.horario,
    }),
    chaveOperacao: linha.chave_operacao,
  };
}

// ---------------------------------------------------------------------------
// Agendamentos

/** Grava o agendamento. Lança violação de unicidade se o horário já estiver reservado. */
export function inserirAgendamento(
  banco: Banco,
  dados: DadosProposta,
): AgendamentoGravado {
  const { lastInsertRowid } = banco
    .prepare(
      "INSERT INTO agendamentos (cliente, profissional, data, horario, criado_em) VALUES (?, ?, ?, ?, ?)",
    )
    .run(dados.cliente, dados.profissional, dados.data, dados.horario, agora());

  return { id: Number(lastInsertRowid), ...dados };
}

export function buscarAgendamento(
  banco: Banco,
  agendamentoId: number,
): AgendamentoGravado | undefined {
  const linha = banco
    .prepare(
      "SELECT id, cliente, profissional, data, horario FROM agendamentos WHERE id = ?",
    )
    .get(agendamentoId) as AgendamentoGravado | undefined;
  return linha === undefined ? undefined : { ...linha };
}

/** Verdadeiro se já existe agendamento para o profissional, a data e o horário. */
export function horarioReservado(banco: Banco, dados: DadosProposta): boolean {
  return (
    banco
      .prepare(
        "SELECT 1 FROM agendamentos WHERE profissional = ? AND data = ? AND horario = ?",
      )
      .get(dados.profissional, dados.data, dados.horario) !== undefined
  );
}

export function contarAgendamentos(banco: Banco): number {
  return (banco.prepare("SELECT COUNT(*) AS total FROM agendamentos").get() as {
    total: number;
  }).total;
}

// ---------------------------------------------------------------------------
// Operações

export type ChaveDaOperacao = {
  usuario: string;
  tipoOperacao: string;
  chave: string;
};

export type OperacaoGravada = ChaveDaOperacao & {
  /** Dados aprovados quando a operação foi concluída. */
  dados: DadosProposta;
  agendamentoId: number;
};

type LinhaOperacao = {
  usuario: string;
  tipo_operacao: string;
  chave: string;
  cliente: string;
  profissional: string;
  data: string;
  horario: string;
  agendamento_id: number;
};

export function buscarOperacao(
  banco: Banco,
  chave: ChaveDaOperacao,
): OperacaoGravada | undefined {
  const linha = banco
    .prepare(
      "SELECT * FROM operacoes WHERE usuario = ? AND tipo_operacao = ? AND chave = ?",
    )
    .get(chave.usuario, chave.tipoOperacao, chave.chave) as LinhaOperacao | undefined;
  if (linha === undefined) return undefined;

  return {
    usuario: linha.usuario,
    tipoOperacao: linha.tipo_operacao,
    chave: linha.chave,
    dados: Object.freeze({
      cliente: linha.cliente,
      profissional: linha.profissional,
      data: linha.data,
      horario: linha.horario,
    }),
    agendamentoId: linha.agendamento_id,
  };
}

/**
 * Registra a operação concluída. Não substitui: lança violação de unicidade
 * se a chave já existir. O agendamento referenciado precisa existir.
 */
export function inserirOperacao(banco: Banco, operacao: OperacaoGravada): void {
  banco
    .prepare(
      `INSERT INTO operacoes
         (usuario, tipo_operacao, chave, cliente, profissional, data, horario, agendamento_id, concluida_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      operacao.usuario,
      operacao.tipoOperacao,
      operacao.chave,
      operacao.dados.cliente,
      operacao.dados.profissional,
      operacao.dados.data,
      operacao.dados.horario,
      operacao.agendamentoId,
      agora(),
    );
}
