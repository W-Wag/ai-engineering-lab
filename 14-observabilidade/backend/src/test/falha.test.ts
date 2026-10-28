import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "../agendamentos.js";
import { construirApp } from "../app.js";
import { abrirBanco, contarAgendamentos, type Banco } from "../banco.js";
import { INSTRUCOES_SYSTEM } from "../instrucoes.js";
import { criarProcessadorDeRodada } from "../rodada.js";
import { semUso, type ModeloSimples } from "./modelo-simulado.js";

// Mecanismo de falha simulada (falharAposCriar), com app.inject (Fastify dentro
// do processo, sem rede), modelo simulado e banco em memória. Sem Groq.
// Não reproduz a investigação com reinício: só confere onde a falha atua.

const modelo: ModeloSimples = async (mensagens) => {
  const ultima = mensagens.at(-1)!;
  if (ultima.role === "tool") return { role: "assistant", content: "ok", refusal: null };
  return {
    role: "assistant",
    content: null,
    refusal: null,
    tool_calls: [{
      id: "t1",
      type: "function",
      function: {
        name: "prepararPropostaAgendamento",
        arguments: JSON.stringify({ profissionalId: "ana", data: "2026-10-20", horario: String(ultima.content) }),
      },
    }],
  };
};

function montar(banco: Banco, falharAposCriar?: boolean) {
  const agendamentos = new ServicoDeAgendamentos(banco);
  return construirApp({
    processarRodada: criarProcessadorDeRodada(semUso(modelo), {
      buscarPoliticas: async () => ({ encontrado: false }),
      agendamentos,
      sessao: SESSAO_FICTICIA,
    }),
    instrucoesSystem: INSTRUCOES_SYSTEM,
    banco,
    agendamentos,
    sessao: SESSAO_FICTICIA,
    falharAposCriar,
  });
}

async function proposta(app: ReturnType<typeof montar>, horario: string) {
  const conversaId = (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  const r = await app.inject({ method: "POST", url: `/conversas/${conversaId}/mensagens`, payload: { texto: horario } });
  return { conversaId, propostaId: r.json().propostas[0].propostaId as string };
}

async function confirmar(app: ReturnType<typeof montar>, conversaId: string, propostaId: string) {
  const r = await app.inject({
    method: "POST",
    url: `/conversas/${conversaId}/propostas/${propostaId}/confirmar`,
    payload: {},
  });
  return { status: r.statusCode, corpo: r.json() };
}

test("desligada por padrão", async (t) => {
  const banco = abrirBanco(":memory:");
  const app = montar(banco);
  t.after(() => app.close());
  const { conversaId, propostaId } = await proposta(app, "09:00");
  const r = await confirmar(app, conversaId, propostaId);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.resultado, "criado");
});

test("ligada: HTTP 500 depois de gravar agendamento, operação e registro", async (t) => {
  const banco = abrirBanco(":memory:");
  const app = montar(banco, true);
  t.after(() => app.close());
  const { conversaId, propostaId } = await proposta(app, "09:00");

  const r = await confirmar(app, conversaId, propostaId);
  assert.equal(r.status, 500);
  assert.deepEqual(r.corpo, { erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível processar a mensagem." } });

  assert.equal(contarAgendamentos(banco), 1, "o agendamento ficou gravado");
  assert.equal((banco.prepare("SELECT COUNT(*) AS n FROM operacoes").get() as { n: number }).n, 1, "a operação ficou gravada");
  const registro = banco
    .prepare("SELECT conteudo FROM mensagens WHERE conversa_id = ? AND conteudo LIKE '%Registro da aplicação%'")
    .get(conversaId);
  assert.ok(registro, "o registro no histórico ficou gravado");
});

test("ligada: não atua em erros de validação nem em recuperação", async (t) => {
  const banco = abrirBanco(":memory:");
  const normal = montar(banco);
  const comFalha = montar(banco, true);
  t.after(() => Promise.all([normal.close(), comFalha.close()]));

  const { conversaId, propostaId } = await proposta(normal, "14:00");
  const inexistente = await confirmar(comFalha, conversaId, "nao-existe");
  assert.equal(inexistente.status, 404, "erro de validação segue como antes");

  assert.equal((await confirmar(normal, conversaId, propostaId)).corpo.resultado, "criado");
  const recuperada = await confirmar(comFalha, conversaId, propostaId);
  assert.equal(recuperada.status, 200, "operação já concluída não é afetada");
  assert.equal(recuperada.corpo.resultado, "reutilizado");
  assert.equal(contarAgendamentos(banco), 1);
});
