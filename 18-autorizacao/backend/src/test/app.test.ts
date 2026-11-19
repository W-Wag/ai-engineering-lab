import assert from "node:assert/strict";
import { test } from "node:test";
import { contarMensagens } from "../banco.js";
import { criarAmbiente, entrar } from "./ambiente.js";

// app.inject: autenticação, sessão, CSRF, validação de entrada e o
// BLOQUEIO das rotas enquanto os TODOs estão pendentes. Não testa as
// decisões de acesso (são os TODOs do aluno).

test("login: cookie HttpOnly, SameSite=Lax, Path=/, sem Secure local; sem senha na resposta", async () => {
  const { app } = await criarAmbiente();
  const resposta = await app.inject({
    method: "POST",
    url: "/sessao",
    payload: { login: "ana", senha: "ana-demo-local" },
  });
  assert.equal(resposta.statusCode, 200);
  const cookie = resposta.cookies.find((c) => c.name === "sessao")!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  assert.equal(cookie.path, "/");
  assert.ok(!cookie.secure);
  const corpo = resposta.json();
  assert.deepEqual(corpo.usuario, { id: "u-ana", login: "ana", nome: "Ana (demonstração)" });
  assert.equal(typeof corpo.csrfToken, "string");
  assert.ok(!resposta.body.includes("ana-demo-local") && !resposta.body.includes("scrypt"));
});

test("logs não contêm senha, cookie de sessão nem token CSRF", async () => {
  const linhas: string[] = [];
  const { app } = await criarAmbiente({
    fastify: { logger: { level: "trace", stream: { write: (l: string) => void linhas.push(l) } } },
  });
  const { cookies, csrf } = await entrar(app, "ana", "ana-demo-local");
  await app.inject({ url: "/sessao", cookies });
  await app.inject({ method: "POST", url: "/sessao", payload: { login: "ana", senha: "senha-errada-x" } });
  await app.inject({ method: "DELETE", url: "/sessao", cookies, headers: { "x-csrf-token": csrf } });
  const log = linhas.join("\n");
  assert.ok(linhas.length > 0);
  for (const segredo of ["ana-demo-local", "senha-errada-x", cookies.sessao, csrf]) {
    assert.ok(!log.includes(segredo), "segredo encontrado no log");
  }
});

test("login: em HTTPS o cookie sai com Secure", async () => {
  const { app } = await criarAmbiente({ cookieSeguro: true });
  const resposta = await app.inject({
    method: "POST",
    url: "/sessao",
    payload: { login: "carlos", senha: "carlos-demo-local" },
  });
  assert.equal(resposta.cookies.find((c) => c.name === "sessao")!.secure, true);
});

test("login recusado: mesma resposta para senha errada e login inexistente, sem cookie", async () => {
  const { app } = await criarAmbiente();
  const errada = await app.inject({ method: "POST", url: "/sessao", payload: { login: "ana", senha: "x" } });
  const inexistente = await app.inject({ method: "POST", url: "/sessao", payload: { login: "zeca", senha: "x" } });
  for (const r of [errada, inexistente]) {
    assert.equal(r.statusCode, 401);
    assert.equal(r.cookies.length, 0);
  }
  assert.equal(errada.body, inexistente.body);
});

test("login: campos extras e tipos errados são rejeitados", async () => {
  const { app } = await criarAmbiente();
  const extra = await app.inject({
    method: "POST",
    url: "/sessao",
    payload: { login: "ana", senha: "ana-demo-local", userId: "u-carlos" },
  });
  const tipo = await app.inject({ method: "POST", url: "/sessao", payload: { login: 1, senha: "x" } });
  assert.equal(extra.statusCode, 400);
  assert.equal(tipo.statusCode, 400);
});

test("sessão: sem cookie, cookie inventado e sessão expirada dão 401", async () => {
  const { app, relogio } = await criarAmbiente({ duracaoDaSessaoMs: 60_000 });
  const { cookies } = await entrar(app, "ana", "ana-demo-local");

  assert.equal((await app.inject({ url: "/sessao" })).statusCode, 401);
  assert.equal((await app.inject({ url: "/sessao", cookies: { sessao: "inventado" } })).statusCode, 401);
  const valida = await app.inject({ url: "/sessao", cookies });
  assert.equal(valida.statusCode, 200);
  assert.equal(valida.json().usuario.login, "ana");

  relogio.agora += 60_000;
  assert.equal((await app.inject({ url: "/sessao", cookies })).statusCode, 401);
});

test("logout: exige CSRF; depois dele a sessão não vale mais", async () => {
  const { app } = await criarAmbiente();
  const { cookies, csrf } = await entrar(app, "carlos", "carlos-demo-local");

  const semCsrf = await app.inject({ method: "DELETE", url: "/sessao", cookies });
  assert.equal(semCsrf.statusCode, 403);

  const saida = await app.inject({ method: "DELETE", url: "/sessao", cookies, headers: { "x-csrf-token": csrf } });
  assert.equal(saida.statusCode, 204);
  assert.ok(saida.cookies.some((c) => c.name === "sessao" && c.value === ""), "cookie limpo");

  assert.equal((await app.inject({ url: "/sessao", cookies })).statusCode, 401);
  assert.equal((await app.inject({ url: "/conversas", cookies })).statusCode, 401);
});

test("escrita cross-site (Sec-Fetch-Site) é recusada antes de tudo", async () => {
  const { app } = await criarAmbiente();
  const resposta = await app.inject({
    method: "POST",
    url: "/sessao",
    headers: { "sec-fetch-site": "cross-site" },
    payload: { login: "ana", senha: "ana-demo-local" },
  });
  assert.equal(resposta.statusCode, 403);
  assert.equal(resposta.cookies.length, 0);
});

test("rotas protegidas sem sessão: 401, sem dados e sem chamar o modelo", async () => {
  const { app, banco, modelo } = await criarAmbiente();
  const antes = contarMensagens(banco);
  const respostas = await Promise.all([
    app.inject({ url: "/conversas" }),
    app.inject({ url: "/conversas/conv-ana-1" }),
    app.inject({ method: "POST", url: "/conversas", payload: { titulo: "x" } }),
    app.inject({ method: "POST", url: "/conversas/conv-ana-1/mensagens", payload: { texto: "x" } }),
  ]);
  for (const r of respostas) {
    assert.equal(r.statusCode, 401);
    assert.ok(!r.body.includes("Campanha") && !r.body.includes("orçamento"));
  }
  assert.equal(modelo.observacao.chamadas, 0);
  assert.equal(contarMensagens(banco), antes);
});

test("escritas autenticadas sem CSRF: 403", async () => {
  const { app } = await criarAmbiente();
  const { cookies } = await entrar(app, "ana", "ana-demo-local");
  const criar = await app.inject({ method: "POST", url: "/conversas", cookies, payload: { titulo: "x" } });
  const responder = await app.inject({
    method: "POST",
    url: "/conversas/conv-ana-1/mensagens",
    cookies,
    headers: { "x-csrf-token": "errado" },
    payload: { texto: "x" },
  });
  assert.equal(criar.statusCode, 403);
  assert.equal(responder.statusCode, 403);
});

test("criação: userId no corpo é rejeitado pelo contrato (400)", async () => {
  const { app, banco } = await criarAmbiente();
  const { cookies, csrf } = await entrar(app, "ana", "ana-demo-local");
  const resposta = await app.inject({
    method: "POST",
    url: "/conversas",
    cookies,
    headers: { "x-csrf-token": csrf },
    payload: { titulo: "x", userId: "u-carlos" },
  });
  assert.equal(resposta.statusCode, 400);
  assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM conversas").get()!.n, 3);
});

// ---------- Construção (depois dos TODOs do aluno) ----------
// Fluxos de cada usuário com os PRÓPRIOS recursos. Tentativas sobre
// recursos de outra conta ficam para a investigação.

test("construção: Ana e Carlos listam e abrem as próprias conversas", async () => {
  const { app } = await criarAmbiente();
  const ana = await entrar(app, "ana", "ana-demo-local");
  const carlos = await entrar(app, "carlos", "carlos-demo-local");

  const listaAna = (await app.inject({ url: "/conversas", cookies: ana.cookies })).json().conversas;
  const listaCarlos = (await app.inject({ url: "/conversas", cookies: carlos.cookies })).json().conversas;
  assert.deepEqual(listaAna.map((c: { id: string }) => c.id).sort(), ["conv-ana-1", "conv-ana-2"]);
  assert.deepEqual(listaCarlos.map((c: { id: string }) => c.id), ["conv-carlos-1"]);

  const abertaAna = await app.inject({ url: "/conversas/conv-ana-1", cookies: ana.cookies });
  const abertaCarlos = await app.inject({ url: "/conversas/conv-carlos-1", cookies: carlos.cookies });
  assert.equal(abertaAna.statusCode, 200);
  assert.equal(abertaAna.json().mensagens.length, 2);
  assert.equal(abertaCarlos.statusCode, 200);
  assert.equal(abertaCarlos.json().conversa.proprietarioId, "u-carlos");
});

test("construção: conversa nova pertence ao usuário autenticado", async () => {
  const { app } = await criarAmbiente();
  const carlos = await entrar(app, "carlos", "carlos-demo-local");
  const criada = await app.inject({
    method: "POST",
    url: "/conversas",
    cookies: carlos.cookies,
    headers: { "x-csrf-token": carlos.csrf },
    payload: { titulo: "Ideias de outono" },
  });
  assert.equal(criada.statusCode, 201);
  const { conversa } = criada.json();
  assert.equal(conversa.proprietarioId, "u-carlos");
  const lista = (await app.inject({ url: "/conversas", cookies: carlos.cookies })).json().conversas;
  assert.ok(lista.some((c: { id: string }) => c.id === conversa.id));
});

test("construção: resposta autorizada chama o modelo uma vez com o histórico e grava duas mensagens", async () => {
  const { app, banco, modelo } = await criarAmbiente();
  const ana = await entrar(app, "ana", "ana-demo-local");
  const antes = contarMensagens(banco);
  const resposta = await app.inject({
    method: "POST",
    url: "/conversas/conv-ana-1/mensagens",
    cookies: ana.cookies,
    headers: { "x-csrf-token": ana.csrf },
    payload: { texto: "Qual tema você recomenda?" },
  });
  assert.equal(resposta.statusCode, 201);
  assert.deepEqual(resposta.json().mensagens.map((m: { autor: string }) => m.autor), ["usuario", "assistente"]);
  assert.equal(modelo.observacao.chamadas, 1);
  assert.equal(modelo.observacao.recebidas[0]!.length, 3);
  assert.equal(modelo.observacao.recebidas[0]!.at(-1)!.texto, "Qual tema você recomenda?");
  assert.equal(contarMensagens(banco), antes + 2);
});

test("construção: conversa inexistente dá 404 sem chamar o modelo e sem gravar", async () => {
  const { app, banco, modelo } = await criarAmbiente();
  const ana = await entrar(app, "ana", "ana-demo-local");
  const antes = contarMensagens(banco);
  const abrir = await app.inject({ url: "/conversas/nao-existe", cookies: ana.cookies });
  const responder = await app.inject({
    method: "POST",
    url: "/conversas/nao-existe/mensagens",
    cookies: ana.cookies,
    headers: { "x-csrf-token": ana.csrf },
    payload: { texto: "oi" },
  });
  assert.equal(abrir.statusCode, 404);
  assert.equal(responder.statusCode, 404);
  assert.equal(modelo.observacao.chamadas, 0);
  assert.equal(contarMensagens(banco), antes);
});
