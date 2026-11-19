import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { gerarHashDeSenha } from "./senha.js";
import type { Autor, Conversa, Mensagem } from "./tipos.js";

// SQLite embutido no Node (node:sqlite), em memória: cada início do servidor
// recomeça com os dados de demonstração. As funções daqui só leem e gravam;
// NENHUMA delas decide quem pode acessar o quê.

export type Banco = DatabaseSync;
type Linha = Record<string, unknown>;

export function abrirBanco(): Banco {
  const banco = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  banco.exec(`
    CREATE TABLE usuarios (
      id         TEXT PRIMARY KEY,
      login      TEXT NOT NULL UNIQUE,
      nome       TEXT NOT NULL,
      senha_hash TEXT NOT NULL
    ) STRICT;

    -- Sessão opaca: guarda só o HASH do token; o token fica no cookie.
    CREATE TABLE sessoes (
      token_hash TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      csrf_token TEXT NOT NULL,
      expira_em  INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE conversas (
      id             TEXT PRIMARY KEY,
      proprietario_id TEXT NOT NULL REFERENCES usuarios(id),
      titulo         TEXT NOT NULL,
      criada_em      TEXT NOT NULL
    ) STRICT;

    CREATE TABLE mensagens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      conversa_id TEXT NOT NULL REFERENCES conversas(id),
      autor       TEXT NOT NULL CHECK (autor IN ('usuario', 'assistente')),
      texto       TEXT NOT NULL,
      criada_em   TEXT NOT NULL
    ) STRICT;
  `);
  return banco;
}

// ---------- Dados de demonstração ----------

/**
 * CONTAS DE DEMONSTRAÇÃO LOCAL. Não são contas reais; as senhas estão aqui
 * de propósito para o exercício e só existem neste banco em memória.
 */
export const CONTAS_DE_DEMONSTRACAO = [
  { id: "u-ana", login: "ana", nome: "Ana (demonstração)", senha: "ana-demo-local" },
  { id: "u-carlos", login: "carlos", nome: "Carlos (demonstração)", senha: "carlos-demo-local" },
] as const;

const CONVERSAS_DE_DEMONSTRACAO = [
  {
    id: "conv-ana-1",
    proprietarioId: "u-ana",
    titulo: "Campanha de inverno",
    mensagens: [
      ["usuario", "Quero uma campanha de inverno para a linha Aurora."],
      ["assistente", "Posso sugerir três temas: aconchego, manhãs frias e presentes."],
    ],
  },
  {
    id: "conv-ana-2",
    proprietarioId: "u-ana",
    titulo: "Negociação com fornecedor",
    mensagens: [["usuario", "Anotação privada da Ana: o teto do orçamento é 18 mil."]],
  },
  {
    id: "conv-carlos-1",
    proprietarioId: "u-carlos",
    titulo: "Roteiro do vídeo",
    mensagens: [["usuario", "Rascunho do Carlos para o vídeo de lançamento."]],
  },
] as const;

export async function popularDemonstracao(banco: Banco): Promise<void> {
  const inserirUsuario = banco.prepare(
    "INSERT INTO usuarios (id, login, nome, senha_hash) VALUES (?, ?, ?, ?)",
  );
  for (const conta of CONTAS_DE_DEMONSTRACAO) {
    inserirUsuario.run(conta.id, conta.login, conta.nome, await gerarHashDeSenha(conta.senha));
  }
  const criadaEm = "2026-11-01T12:00:00.000Z";
  const inserir = banco.prepare(
    "INSERT INTO conversas (id, proprietario_id, titulo, criada_em) VALUES (?, ?, ?, ?)",
  );
  for (const c of CONVERSAS_DE_DEMONSTRACAO) {
    inserir.run(c.id, c.proprietarioId, c.titulo, criadaEm);
    inserirMensagens(
      banco,
      c.id,
      c.mensagens.map(([autor, texto]) => ({ autor, texto, criadaEm })),
    );
  }
}

// ---------- Usuários ----------

export function buscarUsuarioPorLogin(banco: Banco, login: string) {
  const linha = banco
    .prepare("SELECT id, login, nome, senha_hash FROM usuarios WHERE login = ?")
    .get(login) as Linha | undefined;
  if (!linha) return null;
  return {
    usuario: { id: String(linha.id), login: String(linha.login), nome: String(linha.nome) },
    senhaHash: String(linha.senha_hash),
  };
}

// ---------- Conversas e mensagens (sem autorização) ----------

/** Converte uma linha de SELECT * FROM conversas em Conversa. */
export function paraConversa(linha: Linha): Conversa {
  return {
    id: String(linha.id),
    titulo: String(linha.titulo),
    proprietarioId: String(linha.proprietario_id),
    criadaEm: String(linha.criada_em),
  };
}

/** Grava uma conversa com o proprietário RECEBIDO. Não decide quem é ele. */
export function inserirConversa(
  banco: Banco,
  dados: { titulo: string; proprietarioId: string },
): Conversa {
  const conversa: Conversa = {
    id: randomUUID(),
    titulo: dados.titulo,
    proprietarioId: dados.proprietarioId,
    criadaEm: new Date().toISOString(),
  };
  banco
    .prepare("INSERT INTO conversas (id, proprietario_id, titulo, criada_em) VALUES (?, ?, ?, ?)")
    .run(conversa.id, conversa.proprietarioId, conversa.titulo, conversa.criadaEm);
  return conversa;
}

/**
 * Mensagens de uma conversa, em ordem. NÃO verifica acesso: só chame
 * depois de confirmar que o usuário pode ver esta conversa.
 */
export function listarMensagens(banco: Banco, conversaId: string): Mensagem[] {
  const linhas = banco
    .prepare("SELECT autor, texto, criada_em FROM mensagens WHERE conversa_id = ? ORDER BY id")
    .all(conversaId) as Linha[];
  return linhas.map((l) => ({
    autor: String(l.autor) as Autor,
    texto: String(l.texto),
    criadaEm: String(l.criada_em),
  }));
}

/** Grava várias mensagens numa transação. NÃO verifica acesso. */
export function inserirMensagens(banco: Banco, conversaId: string, mensagens: Mensagem[]): void {
  const inserir = banco.prepare(
    "INSERT INTO mensagens (conversa_id, autor, texto, criada_em) VALUES (?, ?, ?, ?)",
  );
  banco.exec("BEGIN");
  try {
    for (const m of mensagens) inserir.run(conversaId, m.autor, m.texto, m.criadaEm);
    banco.exec("COMMIT");
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

/** Para testes: total de mensagens gravadas no banco inteiro. */
export function contarMensagens(banco: Banco): number {
  const linha = banco.prepare("SELECT COUNT(*) AS total FROM mensagens").get() as Linha;
  return Number(linha.total);
}
