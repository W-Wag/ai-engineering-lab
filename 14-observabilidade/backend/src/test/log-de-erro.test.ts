import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { construirApp } from "../app.js";
import { abrirBanco } from "../banco.js";

// HTTP pelo Fastify dentro do processo (app.inject), com o logger real do
// Fastify (pino) escrevendo num fluxo em memória. Nenhuma chamada à Groq.
// A mensagem "sensível" abaixo é FICTÍCIA.

const SEGREDO = "gsk_FICTICIO_nao_deve_aparecer";

/** Erro no formato dos erros do SDK: nome, status e uma mensagem sensível. */
function erroDoSdk() {
  return Object.assign(new Error(`Bearer ${SEGREDO} recusado`), { name: "InternalServerError", status: 503 });
}

test("falha não tratada: log sem a mensagem original, com reqId, e HTTP inalterado", async () => {
  const linhas: string[] = [];
  const saida = new Writable({
    write(pedaco, _codificacao, pronto) {
      linhas.push(...String(pedaco).split("\n").filter(Boolean));
      pronto();
    },
  });

  const app = construirApp({
    processarRodada: async () => {
      throw erroDoSdk();
    },
    instrucoesSystem: "instruções de teste",
    banco: abrirBanco(":memory:"),
    fastify: { logger: { level: "info", stream: saida } },
  });

  const conversaId = (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  const resposta = await app.inject({
    method: "POST",
    url: `/conversas/${conversaId}/mensagens`,
    payload: { texto: "oi" },
  });
  await app.close();

  assert.equal(resposta.statusCode, 500);
  assert.deepEqual(resposta.json(), {
    erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível processar a mensagem." },
  });

  const tudo = linhas.join("\n");
  assert.ok(!tudo.includes(SEGREDO), "a mensagem original não pode aparecer em nenhuma linha");
  assert.ok(!tudo.includes("Bearer"));

  const eventos = linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
  const doTratador = eventos.find((e) => e.msg === "falha não tratada");
  assert.ok(doTratador, "o tratador registra a falha");
  assert.equal(doTratador.level, 50);
  assert.equal(doTratador.codigoErro, "InternalServerError");
  assert.equal(doTratador.statusErro, 503);

  // Correlação: a linha do tratador e o resumo têm o id da requisição.
  const resumo = eventos.find((e) => e.evento === "rodada.resumo")!;
  assert.equal(doTratador.reqId, resumo.requisicaoId);
});
