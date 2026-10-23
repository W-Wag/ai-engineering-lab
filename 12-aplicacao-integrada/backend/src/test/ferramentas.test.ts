import assert from "node:assert/strict";
import { test } from "node:test";
import type Groq from "groq-sdk";
import { construirApp } from "../app.js";
import {
  criarDefinicoesDeFerramentas,
  eConsultaPoliticasValida,
  executarChamada,
  type BuscadorDePoliticas,
} from "../ferramentas.js";
import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "../agendamentos.js";
import { INSTRUCOES_SYSTEM } from "../instrucoes.js";
import { ranquearPoliticas } from "../politicas.js";
import { criarProcessadorDeRodada, type ChamadorDeModelo } from "../rodada.js";

// Bloco 2. Modelo simulado e busca simulada: nenhuma chamada à Groq. A
// consulta de disponibilidade é a real do módulo 03.

type Chamada = Groq.Chat.ChatCompletionMessageToolCall;

const chamada = (id: string, name: string, args: unknown): Chamada => ({
  id,
  type: "function",
  function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
});

/** Busca simulada: devolve sempre o mesmo trecho fictício para a consulta. */
const buscaSimulada =
  (secao: string): BuscadorDePoliticas =>
  async (consulta) => ({
    encontrado: true,
    trecho: { conteudo: `trecho sobre ${consulta}`, fonte: "/caminho/absoluto/manual.md", secao },
  });

/** Contexto mínimo das ferramentas para os testes de despacho. */
const ctx = (buscarPoliticas: BuscadorDePoliticas) => ({
  buscarPoliticas,
  agendamentos: new ServicoDeAgendamentos(),
  sessao: SESSAO_FICTICIA,
  conversaId: "c-teste",
});

/**
 * Modelo simulado: pede a ferramenta indicada pelo texto do usuário e, depois
 * do resultado, responde.
 */
const modeloSimulado: ChamadorDeModelo = async (mensagens) => {
  const ultima = mensagens.at(-1)!;
  if (ultima.role === "tool") {
    return { role: "assistant", content: `resposta com ${ultima.content}`, refusal: null };
  }
  const texto = String(ultima.content);
  const pedir = (...chamadas: Chamada[]) => ({
    role: "assistant" as const,
    content: null,
    refusal: null,
    tool_calls: chamadas,
  });
  if (texto === "horarios") {
    return pedir(chamada("d1", "consultarDisponibilidade", { profissionalId: "ana", data: "2026-10-20" }));
  }
  if (texto === "politica") return pedir(chamada("p1", "consultarPoliticas", { consulta: "taxa" }));
  if (texto === "politica 2x") {
    return pedir(
      chamada("p1", "consultarPoliticas", { consulta: "taxa" }),
      chamada("p2", "consultarPoliticas", { consulta: "taxa de novo" }),
    );
  }
  if (texto === "argumento vazio") return pedir(chamada("p1", "consultarPoliticas", { consulta: "  " }));
  if (texto === "desconhecida") return pedir(chamada("x1", "apagarTudo", {}));
  return { role: "assistant", content: "sem ferramenta", refusal: null };
};

function app(buscar: BuscadorDePoliticas) {
  return construirApp({
    processarRodada: criarProcessadorDeRodada(modeloSimulado, { buscarPoliticas: buscar, agendamentos: new ServicoDeAgendamentos(), sessao: SESSAO_FICTICIA }),
    instrucoesSystem: INSTRUCOES_SYSTEM,
  });
}

async function enviar(a: ReturnType<typeof app>, conversaId: string, texto: string) {
  const r = await a.inject({
    method: "POST",
    url: `/conversas/${conversaId}/mensagens`,
    payload: { texto },
  });
  return { status: r.statusCode, corpo: r.json() };
}

async function criarConversa(a: ReturnType<typeof app>): Promise<string> {
  return (await a.inject({ method: "POST", url: "/conversas" })).json().conversaId;
}

test("definições: disponibilidade preservada e consultarPoliticas com consulta obrigatória", () => {
  const definicoes = criarDefinicoesDeFerramentas();
  assert.deepEqual(
    definicoes.map((d) => d.function?.name),
    ["consultarDisponibilidade", "consultarPoliticas", "prepararPropostaAgendamento"],
  );
  assert.deepEqual(definicoes[1]?.function?.parameters?.required, ["consulta"]);
  assert.equal(eConsultaPoliticasValida({ consulta: "taxa" }), true);
  for (const invalido of [{ consulta: "" }, { consulta: "  " }, { consulta: 1 }, {}, null, [], "taxa"]) {
    assert.equal(eConsultaPoliticasValida(invalido), false);
  }
});

test("despacho: resultado associado ao tool_call_id, fonte sem caminho", async () => {
  const politica = await executarChamada(chamada("abc", "consultarPoliticas", { consulta: " taxa " }), ctx(buscaSimulada("Cancelamento")));
  assert.equal(politica.mensagem.role, "tool");
  assert.equal((politica.mensagem as { tool_call_id: string }).tool_call_id, "abc");
  const conteudo = JSON.parse(String(politica.mensagem.content));
  assert.equal(conteudo.tipo, "conteudo_de_referencia");
  assert.equal(conteudo.trecho.conteudo, "trecho sobre taxa", "consulta enviada sem espaços nas pontas");
  assert.equal(conteudo.trecho.fonte, "manual.md");
  assert.deepEqual(politica.fontes, [{ fonte: "manual.md", secao: "Cancelamento" }]);

  const nada = await executarChamada(chamada("n", "consultarPoliticas", { consulta: "x" }), ctx(async () => ({ encontrado: false })));
  assert.deepEqual(nada.fontes, []);
  assert.equal(JSON.parse(String(nada.mensagem.content)).encontrado, false);

  const disp = await executarChamada(chamada("d", "consultarDisponibilidade", { profissionalId: "ana", data: "2026-10-20" }), ctx(buscaSimulada("x")));
  assert.deepEqual(JSON.parse(String(disp.mensagem.content)), { horarios: ["09:00", "14:00"] });
  assert.deepEqual(disp.fontes, []);

  await assert.rejects(() => executarChamada(chamada("j", "consultarPoliticas", "{quebrado"), ctx(buscaSimulada("x"))), /JSON malformado/);
});

test("HTTP: fontes por mensagem, sem duplicação nem vazamento", async (t) => {
  const a = app(buscaSimulada("Cancelamento"));
  t.after(() => a.close());
  const c1 = await criarConversa(a);
  const c2 = await criarConversa(a);

  const comBusca = await enviar(a, c1, "politica");
  assert.equal(comBusca.status, 200);
  assert.deepEqual(comBusca.corpo.fontesConsultadas, [{ fonte: "manual.md", secao: "Cancelamento" }]);
  assert.match(comBusca.corpo.resposta, /conteudo_de_referencia/);

  const semBusca = await enviar(a, c1, "oi");
  assert.deepEqual(semBusca.corpo.fontesConsultadas, [], "fontes da mensagem anterior não vazam");

  const outraConversa = await enviar(a, c2, "oi");
  assert.deepEqual(outraConversa.corpo.fontesConsultadas, [], "fontes de outra conversa não vazam");

  const duplicada = await enviar(a, c2, "politica 2x");
  assert.deepEqual(duplicada.corpo.fontesConsultadas, [{ fonte: "manual.md", secao: "Cancelamento" }]);

  const horarios = await enviar(a, c2, "horarios");
  assert.equal(horarios.status, 200);
  assert.match(horarios.corpo.resposta, /09:00/);
  assert.deepEqual(horarios.corpo.fontesConsultadas, [], "disponibilidade não gera fonte");
});

test("HTTP: erros da ferramenta preservam o contrato e a trava", async (t) => {
  let falhar = true;
  const a = app(async (consulta) => {
    if (falhar) throw new Error("detalhe interno /home/segredo");
    return buscaSimulada("Duração")(consulta);
  });
  t.after(() => a.close());
  const id = await criarConversa(a);

  for (const texto of ["argumento vazio", "desconhecida", "politica"]) {
    const r = await enviar(a, id, texto);
    assert.equal(r.status, 500, texto);
    assert.deepEqual(r.corpo, { erro: { codigo: "ERRO_INTERNO", mensagem: "Não foi possível processar a mensagem." } });
  }

  falhar = false;
  const depois = await enviar(a, id, "politica");
  assert.equal(depois.status, 200, "trava liberada após falhas");
  assert.deepEqual(depois.corpo.fontesConsultadas, [{ fonte: "manual.md", secao: "Duração" }]);
});

test("ranking pronto: manual do módulo 07, com metadados (embeddings locais)", async () => {
  // Consulta alheia ao exercício; não verifica a ordem.
  const ranking = await ranquearPoliticas("horário de funcionamento da clínica");
  assert.equal(ranking.length, 3);
  assert.deepEqual(new Set(ranking.map((t) => t.secao)), new Set(["Cancelamento", "Duração", "Funcionamento"]));
  for (const t of ranking) {
    assert.equal(t.fonte, "manual-atendimento.md");
    assert.equal(typeof t.pontuacao, "number");
  }
  for (let i = 1; i < ranking.length; i++) {
    assert.ok(ranking[i - 1]!.pontuacao >= ranking[i]!.pontuacao);
  }
});
