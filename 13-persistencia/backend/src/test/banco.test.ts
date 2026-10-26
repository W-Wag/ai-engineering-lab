import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  abrirBanco,
  acrescentarMensagens,
  buscarAgendamento,
  buscarOperacao,
  buscarProposta,
  contarAgendamentos,
  criarEsquema,
  emTransacao,
  eViolacaoDeUnicidade,
  horarioReservado,
  inserirAgendamento,
  inserirConversa,
  inserirOperacao,
  inserirProposta,
  listarMensagens,
} from "../banco.js";

// Testes só da camada de banco, sem HTTP e sem modelo.

const DADOS = Object.freeze({ cliente: "joao", profissional: "ana", data: "2026-10-20", horario: "09:00" });

function bancoComConversa() {
  const banco = abrirBanco(":memory:");
  inserirConversa(banco, { id: "c1", usuario: "joao" });
  return banco;
}

function arquivoTemporario(t: { after: (fn: () => void) => void }): string {
  const pasta = mkdtempSync(join(tmpdir(), "banco13-"));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  return join(pasta, "agenda.sqlite");
}

test("esquema pode ser criado de novo sem apagar dados", () => {
  const banco = bancoComConversa();
  criarEsquema(banco);
  assert.equal(listarMensagens(banco, "c1").length, 0);
  assert.ok(banco.prepare("SELECT 1 FROM conversas WHERE id = 'c1'").get());
});

test("relações: chaves estrangeiras ativas", () => {
  const banco = abrirBanco(":memory:");
  assert.equal((banco.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.throws(() => acrescentarMensagens(banco, "nao-existe", [{ role: "user", content: "x" }]), /FOREIGN KEY/);
  assert.throws(
    () => inserirProposta(banco, { id: "p", conversaId: "nao-existe", usuario: "joao", dados: DADOS, chaveOperacao: "k" }),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => inserirOperacao(banco, { usuario: "joao", tipoOperacao: "t", chave: "k", dados: DADOS, agendamentoId: 999 }),
    /FOREIGN KEY/,
  );
});

test("mensagens: ordem e conteúdo completo preservados", () => {
  const banco = bancoComConversa();
  const chamada = { id: "t1", type: "function" as const, function: { name: "f", arguments: "{}" } };
  acrescentarMensagens(banco, "c1", [{ role: "system", content: "s" }, { role: "user", content: "1" }]);
  acrescentarMensagens(banco, "c1", [
    { role: "assistant", content: null, tool_calls: [chamada] },
    { role: "tool", tool_call_id: "t1", content: "{}" },
  ]);
  const historico = listarMensagens(banco, "c1");
  assert.deepEqual(historico.map((m) => m.role), ["system", "user", "assistant", "tool"]);
  assert.deepEqual((historico[2] as { tool_calls: unknown }).tool_calls, [chamada]);
  assert.equal((historico[3] as { tool_call_id: string }).tool_call_id, "t1");
});

test("proposta gravada com vínculos e chave estável", () => {
  const banco = bancoComConversa();
  inserirProposta(banco, { id: "p1", conversaId: "c1", usuario: "joao", dados: DADOS, chaveOperacao: "proposta-p1" });
  assert.deepEqual(buscarProposta(banco, "p1"), {
    id: "p1", conversaId: "c1", usuario: "joao", dados: DADOS, chaveOperacao: "proposta-p1",
  });
  assert.equal(buscarProposta(banco, "outra"), undefined);
  assert.throws(
    () => inserirProposta(banco, { id: "p2", conversaId: "c1", usuario: "joao", dados: DADOS, chaveOperacao: "proposta-p1" }),
    (e: unknown) => eViolacaoDeUnicidade(e),
    "chave de operação única por proposta",
  );
});

test("horário fixo: uma reserva por profissional, data e horário", () => {
  const banco = abrirBanco(":memory:");
  const primeiro = inserirAgendamento(banco, DADOS);
  assert.deepEqual(buscarAgendamento(banco, primeiro.id), { ...DADOS, id: primeiro.id });
  assert.equal(horarioReservado(banco, DADOS), true);
  assert.equal(horarioReservado(banco, { ...DADOS, horario: "14:00" }), false);
  assert.throws(() => inserirAgendamento(banco, { ...DADOS, cliente: "outro" }), (e: unknown) => eViolacaoDeUnicidade(e));
  assert.equal(contarAgendamentos(banco), 1);
});

test("operação: chave única por usuário e tipo, com os dados aprovados", () => {
  const banco = abrirBanco(":memory:");
  const a = inserirAgendamento(banco, DADOS);
  const b = inserirAgendamento(banco, { ...DADOS, horario: "14:00" });
  const chave = { usuario: "joao", tipoOperacao: "criar-agendamento", chave: "k1" };

  inserirOperacao(banco, { ...chave, dados: DADOS, agendamentoId: a.id });
  assert.deepEqual(buscarOperacao(banco, chave), { ...chave, dados: DADOS, agendamentoId: a.id });

  assert.throws(
    () => inserirOperacao(banco, { ...chave, dados: { ...DADOS, horario: "14:00" }, agendamentoId: b.id }),
    (e: unknown) => eViolacaoDeUnicidade(e),
    "mesma chave não sobrescreve",
  );
  assert.equal(buscarOperacao(banco, chave)?.dados.horario, "09:00");

  // Mesmo valor de chave para outro usuário é outra operação.
  inserirOperacao(banco, { ...chave, usuario: "maria", dados: DADOS, agendamentoId: b.id });
  assert.equal(buscarOperacao(banco, { ...chave, usuario: "ana" }), undefined);
});

test("transação: commit, rollback e recusa de trabalho assíncrono", () => {
  const banco = abrirBanco(":memory:");

  emTransacao(banco, () => inserirAgendamento(banco, DADOS));
  assert.equal(contarAgendamentos(banco), 1);

  // Agendamento e operação juntos: se a operação falha, o agendamento volta.
  const existente = inserirAgendamento(banco, { ...DADOS, horario: "10:00" });
  const chave = { usuario: "joao", tipoOperacao: "t", chave: "k" };
  inserirOperacao(banco, { ...chave, dados: DADOS, agendamentoId: existente.id });
  assert.throws(() =>
    emTransacao(banco, () => {
      const novo = inserirAgendamento(banco, { ...DADOS, horario: "14:00" });
      inserirOperacao(banco, { ...chave, dados: DADOS, agendamentoId: novo.id });
    }),
  );
  assert.equal(horarioReservado(banco, { ...DADOS, horario: "14:00" }), false, "rollback desfez o agendamento");

  assert.throws(
    () => emTransacao(banco, (async () => inserirAgendamento(banco, { ...DADOS, horario: "15:00" })) as () => unknown),
    /assíncrono/,
  );
  // A inserção síncrona antes do primeiro await também foi desfeita.
  assert.equal(horarioReservado(banco, { ...DADOS, horario: "15:00" }), false);
  assert.equal(banco.isTransaction, false, "nenhuma transação fica aberta");
});

test("arquivo: dados sobrevivem ao fechar e reabrir", (t) => {
  const caminho = arquivoTemporario(t);
  const primeiro = abrirBanco(caminho);
  inserirConversa(primeiro, { id: "c1", usuario: "joao" });
  acrescentarMensagens(primeiro, "c1", [{ role: "user", content: "oi" }]);
  const agendamento = inserirAgendamento(primeiro, DADOS);
  primeiro.close();

  const segundo = abrirBanco(caminho);
  t.after(() => segundo.close());
  assert.deepEqual(listarMensagens(segundo, "c1"), [{ role: "user", content: "oi" }]);
  assert.deepEqual(buscarAgendamento(segundo, agendamento.id), { ...DADOS, id: agendamento.id });
});
