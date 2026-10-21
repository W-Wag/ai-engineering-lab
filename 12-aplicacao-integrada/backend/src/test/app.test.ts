import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consultarDisponibilidade,
} from "../../../../03-harness/src/disponibilidade.js";
import { construirApp } from "../app.js";
import {
  RepositorioDeConversas,
  type Mensagem,
  type ProcessadorDeRodada,
} from "../conversas.js";

// HTTP real (app.inject) com processamento simulado: nenhuma chamada à Groq.

const SYSTEM = "instruções de teste";

function app(processarRodada: ProcessadorDeRodada) {
  return construirApp({ processarRodada, instrucoesSystem: SYSTEM });
}

const responderTexto =
  (texto: string): ProcessadorDeRodada =>
  async () => [{ role: "assistant", content: texto }];

async function criarConversa(a: ReturnType<typeof app>): Promise<string> {
  const r = await a.inject({ method: "POST", url: "/conversas" });
  assert.equal(r.statusCode, 201);
  return r.json().conversaId;
}

function enviar(a: ReturnType<typeof app>, conversaId: string, corpo: unknown) {
  return a.inject({
    method: "POST",
    url: `/conversas/${conversaId}/mensagens`,
    payload: corpo as object,
  });
}

test("cria conversa e responde", async (t) => {
  const a = app(responderTexto("olá"));
  t.after(() => a.close());
  const id = await criarConversa(a);
  const r = await enviar(a, id, { texto: "oi" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { resposta: "olá" });
});

test("valida texto e conversa", async (t) => {
  const a = app(responderTexto("olá"));
  t.after(() => a.close());
  const id = await criarConversa(a);

  for (const corpo of [{ texto: "" }, { texto: "   " }, { texto: 3 }, {}]) {
    const r = await enviar(a, id, corpo);
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().erro.codigo, "TEXTO_INVALIDO");
  }

  const json = await a.inject({
    method: "POST",
    url: `/conversas/${id}/mensagens`,
    headers: { "content-type": "application/json" },
    payload: "{quebrado",
  });
  assert.equal(json.statusCode, 400);
  assert.equal(json.json().erro.codigo, "REQUISICAO_INVALIDA");

  const inexistente = await enviar(a, "nao-existe", { texto: "oi" });
  assert.equal(inexistente.statusCode, 404);
  assert.equal(inexistente.json().erro.codigo, "CONVERSA_NAO_ENCONTRADA");
});

test("cenário de construção com ferramenta, simulado", async () => {
  // Imita o modelo: pede a data; com a data, chama a ferramenta; com o
  // resultado, responde. A ferramenta é a consulta real do módulo 03.
  const simulado: ProcessadorDeRodada = async (mensagens) => {
    const ultima = mensagens.at(-1)!;
    if (ultima.role === "tool") {
      const { horarios } = JSON.parse(String(ultima.content));
      return [{ role: "assistant", content: `Horários: ${horarios.join(", ")}` }];
    }
    if (String(ultima.content).includes("2026")) {
      const consulta = { profissionalId: "ana", data: "2026-10-20" };
      return [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: { name: "consultarDisponibilidade", arguments: JSON.stringify(consulta) },
            },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: JSON.stringify(consultarDisponibilidade(consulta)) },
      ];
    }
    return [{ role: "assistant", content: "Para qual data?" }];
  };

  const repo = new RepositorioDeConversas(simulado, SYSTEM);
  const id = repo.criarConversa();
  assert.equal(await repo.enviarMensagem(id, "Quais horários a Ana tem?"), "Para qual data?");
  assert.equal(await repo.enviarMensagem(id, "20 de outubro de 2026."), "Horários: 09:00, 14:00");
  assert.deepEqual(
    repo.historico(id).map((m: Mensagem) => m.role),
    ["system", "user", "assistant", "user", "assistant", "tool", "assistant"],
  );
});

test("conversas isoladas", async () => {
  const contarUsuario: ProcessadorDeRodada = async (mensagens) => [
    { role: "assistant", content: String(mensagens.filter((m) => m.role === "user").length) },
  ];
  const repo = new RepositorioDeConversas(contarUsuario, SYSTEM);
  const a = repo.criarConversa();
  const b = repo.criarConversa();
  assert.notEqual(a, b);
  assert.equal(await repo.enviarMensagem(a, "1"), "1");
  assert.equal(await repo.enviarMensagem(a, "2"), "2");
  assert.equal(await repo.enviarMensagem(b, "1"), "1");
  assert.equal(repo.historico(b).length, 3);
});

test("trava por conversa e liberação após falha", async (t) => {
  let liberar!: () => void;
  let modo: "esperar" | "falhar" | "ok" = "esperar";
  const controlado: ProcessadorDeRodada = async () => {
    if (modo === "esperar") await new Promise<void>((r) => (liberar = r));
    if (modo === "falhar") throw new Error("segredo interno 123");
    return [{ role: "assistant", content: "ok" }];
  };
  const a = app(controlado);
  t.after(() => a.close());
  const id = await criarConversa(a);
  const outra = await criarConversa(a);

  const primeira = enviar(a, id, { texto: "um" });
  await new Promise((r) => setImmediate(r));
  const segunda = await enviar(a, id, { texto: "dois" });
  assert.equal(segunda.statusCode, 409);
  assert.equal(segunda.json().erro.codigo, "CONVERSA_OCUPADA");

  modo = "ok";
  const deOutra = await enviar(a, outra, { texto: "x" });
  assert.equal(deOutra.statusCode, 200, "outra conversa não fica travada");

  liberar();
  assert.equal((await primeira).statusCode, 200);

  modo = "falhar";
  const falha = await enviar(a, id, { texto: "três" });
  assert.equal(falha.statusCode, 500);
  assert.deepEqual(falha.json(), {
    erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível processar a mensagem." },
  });
  assert.ok(!falha.body.includes("segredo") && !falha.body.includes("at "));

  modo = "ok";
  const depois = await enviar(a, id, { texto: "quatro" });
  assert.equal(depois.statusCode, 200, "trava liberada após falha");
});

test("falha não altera histórico", async () => {
  let falhar = true;
  const repo = new RepositorioDeConversas(async () => {
    if (falhar) throw new Error("x");
    return [{ role: "assistant", content: "ok" }];
  }, SYSTEM);
  const id = repo.criarConversa();
  await assert.rejects(() => repo.enviarMensagem(id, "a"));
  assert.equal(repo.historico(id).length, 1);
  falhar = false;
  await repo.enviarMensagem(id, "b");
  assert.equal(repo.historico(id).length, 3);
});

test("resposta ausente não é sucesso", async (t) => {
  const vazio = app(responderTexto("  "));
  const nada = app(async () => []);
  const ciclo = app(async () => [{ role: "tool", tool_call_id: "x", content: "{}" }]);
  t.after(() => Promise.all([vazio.close(), nada.close(), ciclo.close()]));

  for (const [a, codigo] of [
    [vazio, "SEM_RESPOSTA"],
    [nada, "SEM_RESPOSTA"],
    [ciclo, "LIMITE_DE_RODADAS"],
  ] as const) {
    const r = await enviar(a, await criarConversa(a), { texto: "oi" });
    assert.equal(r.statusCode, 502);
    assert.equal(r.json().erro.codigo, codigo);
  }
});
