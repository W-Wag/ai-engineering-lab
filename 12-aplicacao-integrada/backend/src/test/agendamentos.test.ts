import assert from "node:assert/strict";
import { test } from "node:test";
import type Groq from "groq-sdk";
import { contarGravacoes } from "../../../../09-acoes-seguras/src/gravacao.js";
import {
  ErroDeConfirmacao,
  SESSAO_FICTICIA,
  ServicoDeAgendamentos,
} from "../agendamentos.js";
import { construirApp } from "../app.js";
import { INSTRUCOES_SYSTEM } from "../instrucoes.js";
import { criarProcessadorDeRodada, type ChamadorDeModelo } from "../rodada.js";

// Bloco 3. Modelo simulado, sem Groq. Disponibilidade real do módulo 03
// (ana, 2026-10-20: 09:00 e 14:00), gravação do 09 e operações do 10.
// A gravação do 09 é um contador do processo inteiro: os testes comparam
// diferenças, não valores absolutos.

type Chamada = Groq.Chat.ChatCompletionMessageToolCall;

const proposta = (id: string, horario: string): Chamada => ({
  id,
  type: "function",
  function: {
    name: "prepararPropostaAgendamento",
    arguments: JSON.stringify({ profissionalId: "ana", data: "2026-10-20", horario }),
  },
});

/** O modelo vê no histórico o que a aplicação registrou. */
let ultimoHistoricoVisto: readonly unknown[] = [];

const modelo: ChamadorDeModelo = async (mensagens) => {
  ultimoHistoricoVisto = mensagens;
  const ultima = mensagens.at(-1)!;
  if (ultima.role === "tool") {
    return { role: "assistant", content: "Proposta preparada; confirme pelo botão.", refusal: null };
  }
  const texto = String(ultima.content);
  const pedir = (...tool_calls: Chamada[]) => ({ role: "assistant" as const, content: null, refusal: null, tool_calls });
  if (texto === "agendar 9") return pedir(proposta("t1", "09:00"));
  if (texto === "agendar 9 e 14") return pedir(proposta("t1", "09:00"), proposta("t2", "14:00"));
  if (texto === "agendar 10") return pedir(proposta("t1", "10:00"));
  if (texto === "agendar com cliente") {
    return pedir({
      id: "t1",
      type: "function",
      function: {
        name: "prepararPropostaAgendamento",
        arguments: JSON.stringify({ profissionalId: "ana", data: "2026-10-20", horario: "09:00", cliente: "maria", confirmado: true }),
      },
    });
  }
  return { role: "assistant", content: "ok", refusal: null };
};

function montar() {
  const agendamentos = new ServicoDeAgendamentos();
  const app = construirApp({
    processarRodada: criarProcessadorDeRodada(modelo, {
      buscarPoliticas: async () => ({ encontrado: false }),
      agendamentos,
      sessao: SESSAO_FICTICIA,
    }),
    instrucoesSystem: INSTRUCOES_SYSTEM,
    agendamentos,
    sessao: SESSAO_FICTICIA,
  });
  return { app, agendamentos };
}

type App = ReturnType<typeof montar>["app"];

async function conversa(app: App): Promise<string> {
  return (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
}

async function mensagem(app: App, conversaId: string, texto: string) {
  const r = await app.inject({ method: "POST", url: `/conversas/${conversaId}/mensagens`, payload: { texto } });
  return { status: r.statusCode, corpo: r.json() };
}

async function confirmar(app: App, conversaId: string, propostaId: string, corpo: object = {}) {
  const r = await app.inject({
    method: "POST",
    url: `/conversas/${conversaId}/propostas/${propostaId}/confirmar`,
    payload: corpo,
  });
  return { status: r.statusCode, corpo: r.json() };
}

test("preparar proposta não grava e chega estruturada à mensagem", async (t) => {
  const { app } = montar();
  t.after(() => app.close());
  const id = await conversa(app);
  const antes = contarGravacoes();

  const r = await mensagem(app, id, "agendar 9");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.propostas.length, 1);
  const [p] = r.corpo.propostas;
  assert.deepEqual(
    { ...p, propostaId: "x" },
    { propostaId: "x", profissional: "ana", data: "2026-10-20", horario: "09:00", estado: "aguardando_confirmacao" },
  );
  assert.equal(contarGravacoes(), antes, "preparar não grava");

  const seguinte = await mensagem(app, id, "oi");
  assert.deepEqual(seguinte.corpo.propostas, [], "propostas não passam para a próxima mensagem");
});

test("cliente e confirmado do modelo são ignorados; duas propostas vêm em lista", async (t) => {
  const { app } = montar();
  t.after(() => app.close());
  const id = await conversa(app);

  // Argumentos extras não fazem parte do contrato: a validação os ignora,
  // e o cliente é sempre o usuário da sessão.
  const extra = await mensagem(app, id, "agendar com cliente");
  assert.equal(extra.corpo.propostas.length, 1);

  const duas = await mensagem(app, id, "agendar 9 e 14");
  assert.deepEqual(duas.corpo.propostas.map((p: { horario: string }) => p.horario), ["09:00", "14:00"]);

  const indisponivel = await mensagem(app, id, "agendar 10");
  assert.deepEqual(indisponivel.corpo.propostas, [], "horário fora da disponibilidade não vira proposta");
});

test("confirmação cria uma vez; repetição reutiliza o mesmo agendamento", async (t) => {
  const { app } = montar();
  t.after(() => app.close());
  const id = await conversa(app);
  const { corpo } = await mensagem(app, id, "agendar 9");
  const propostaId = corpo.propostas[0].propostaId;
  const antes = contarGravacoes();

  // O corpo é ignorado: dados enviados pela interface não mudam a proposta.
  const primeira = await confirmar(app, id, propostaId, { horario: "14:00", cliente: "maria" });
  assert.equal(primeira.status, 200);
  assert.equal(primeira.corpo.resultado, "criado");
  assert.deepEqual(
    { ...primeira.corpo.agendamento, id: 0 },
    { id: 0, profissional: "ana", data: "2026-10-20", horario: "09:00" },
  );

  const segunda = await confirmar(app, id, propostaId);
  assert.equal(segunda.status, 200, "repetição não é rejeitada pelo próprio horário ocupado");
  assert.equal(segunda.corpo.resultado, "reutilizado");
  assert.equal(segunda.corpo.agendamento.id, primeira.corpo.agendamento.id);
  assert.equal(contarGravacoes(), antes + 1, "uma única gravação");

  await mensagem(app, id, "oi");
  assert.ok(
    ultimoHistoricoVisto.some(
      (m) => (m as { role: string; content: string }).role === "system" &&
        (m as { content: string }).content.startsWith("Registro da aplicação:") &&
        (m as { content: string }).content.includes(propostaId),
    ),
    "o resultado confirmado aparece para as rodadas seguintes",
  );
  assert.ok(!ultimoHistoricoVisto.some((m) => (m as { tool_call_id?: string }).tool_call_id?.startsWith("confirmacao")));
});

test("proposta de outra conversa ou de outro usuário é rejeitada", async (t) => {
  const { app, agendamentos } = montar();
  t.after(() => app.close());
  const id = await conversa(app);
  const outra = await conversa(app);
  const { corpo } = await mensagem(app, id, "agendar 9");
  const propostaId = corpo.propostas[0].propostaId;
  const antes = contarGravacoes();

  const deOutraConversa = await confirmar(app, outra, propostaId);
  assert.equal(deOutraConversa.status, 404);
  assert.equal(deOutraConversa.corpo.erro.codigo, "PROPOSTA_NAO_ENCONTRADA");

  const inexistente = await confirmar(app, id, "nao-existe");
  assert.equal(inexistente.status, 404);

  const semConversa = await confirmar(app, "nao-existe", propostaId);
  assert.equal(semConversa.corpo.erro.codigo, "CONVERSA_NAO_ENCONTRADA");

  assert.throws(
    () => agendamentos.confirmar({ usuario: "maria" }, id, propostaId),
    (e: unknown) => e instanceof ErroDeConfirmacao && e.codigo === "PROPOSTA_NAO_ENCONTRADA",
  );
  assert.equal(contarGravacoes(), antes);
});

test("duas propostas para o mesmo horário: uma reserva só", async (t) => {
  const { app } = montar();
  t.after(() => app.close());
  const id = await conversa(app);
  const p1 = (await mensagem(app, id, "agendar 9")).corpo.propostas[0].propostaId;
  const p2 = (await mensagem(app, id, "agendar 9")).corpo.propostas[0].propostaId;
  assert.notEqual(p1, p2);
  const antes = contarGravacoes();

  assert.equal((await confirmar(app, id, p1)).corpo.resultado, "criado");
  const conflito = await confirmar(app, id, p2);
  assert.equal(conflito.status, 409);
  assert.equal(conflito.corpo.erro.codigo, "HORARIO_INDISPONIVEL");
  assert.equal(contarGravacoes(), antes + 1, "falha não grava nem vira sucesso");

  const nova = await mensagem(app, id, "agendar 9");
  assert.deepEqual(nova.corpo.propostas, [], "horário reservado não gera nova proposta");
});

test("confirmação respeita a trava da conversa e a libera", async (t) => {
  let liberar!: () => void;
  let segurar = false;
  const agendamentos = new ServicoDeAgendamentos();
  const processador = criarProcessadorDeRodada(async (mensagens, ferramentas) => {
    if (segurar) await new Promise<void>((r) => (liberar = r));
    return modelo(mensagens, ferramentas);
  }, { buscarPoliticas: async () => ({ encontrado: false }), agendamentos, sessao: SESSAO_FICTICIA });
  const app = construirApp({ processarRodada: processador, instrucoesSystem: INSTRUCOES_SYSTEM, agendamentos });
  t.after(() => app.close());

  const id = await conversa(app);
  const propostaId = (await mensagem(app, id, "agendar 9")).corpo.propostas[0].propostaId;

  segurar = true;
  const emAndamento = mensagem(app, id, "oi");
  await new Promise((r) => setImmediate(r));
  const ocupada = await confirmar(app, id, propostaId);
  assert.equal(ocupada.status, 409);
  assert.equal(ocupada.corpo.erro.codigo, "CONVERSA_OCUPADA");

  segurar = false;
  liberar();
  await emAndamento;

  const depois = await confirmar(app, id, propostaId);
  assert.equal(depois.corpo.resultado, "criado", "trava liberada");
});
