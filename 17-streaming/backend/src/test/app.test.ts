import assert from "node:assert/strict";
import { test } from "node:test";
import { construirApp } from "../app.js";
import { TEXTO_FIXO, criarProdutorSimulado } from "../produtor.js";
import type { EventoDoStream } from "../protocolo.js";

// app.inject: confere status, cabeçalhos e a SEQUÊNCIA de eventos no corpo
// completo. NÃO prova chegada progressiva nem desconexão real: o inject
// entrega o corpo inteiro de uma vez e não tem conexão de rede.

function linhas(corpo: string): EventoDoStream[] {
  assert.ok(corpo.endsWith("\n"), "toda linha termina em \\n");
  return corpo.trimEnd().split("\n").map((linha) => JSON.parse(linha) as EventoDoStream);
}

test("geração normal: deltas em ordem e um único 'concluido' no fim", async () => {
  const app = construirApp({
    produtor: criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 0 }),
    gerarExecucao: () => "exec-1",
  });
  const resposta = await app.inject({ method: "POST", url: "/geracoes" });

  assert.equal(resposta.statusCode, 200);
  assert.match(String(resposta.headers["content-type"]), /application\/x-ndjson/);
  assert.equal(resposta.headers["x-execucao"], "exec-1");

  const eventos = linhas(resposta.body);
  const deltas = eventos.filter((e) => e.tipo === "delta");
  const ultimo = eventos.at(-1)!;

  assert.ok(eventos.every((e) => e.execucao === "exec-1"));
  assert.deepEqual(deltas.map((e) => e.indice), deltas.map((_, i) => i));
  assert.equal(deltas.map((e) => e.texto).join(""), TEXTO_FIXO);
  assert.deepEqual(ultimo, { tipo: "concluido", execucao: "exec-1", fragmentos: deltas.length });
  assert.equal(eventos.filter((e) => e.tipo !== "delta").length, 1);
  await app.close();
});

test("investigação: fluxo incompleto fecha depois de N deltas, sem evento terminal", async () => {
  const app = construirApp({
    produtor: criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 0 }),
    gerarExecucao: () => "exec-3",
    encerrarSemTerminalDepoisDe: 6,
  });
  const resposta = await app.inject({ method: "POST", url: "/geracoes" });

  assert.equal(resposta.statusCode, 200);
  const eventos = linhas(resposta.body);
  assert.equal(eventos.length, 6);
  assert.ok(eventos.every((e) => e.tipo === "delta"));
  await app.close();
});

test("falha depois do início: status continua 200 e o fluxo termina em 'erro'", async () => {
  const app = construirApp({
    produtor: criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 0, falharDepoisDe: 3 }),
    gerarExecucao: () => "exec-2",
  });
  const resposta = await app.inject({ method: "POST", url: "/geracoes" });

  assert.equal(resposta.statusCode, 200);
  const eventos = linhas(resposta.body);
  assert.equal(eventos.filter((e) => e.tipo === "delta").length, 3);
  assert.deepEqual(eventos.at(-1), {
    tipo: "erro",
    execucao: "exec-2",
    codigo: "FALHA_NA_GERACAO",
    mensagem: "Não foi possível concluir a geração.",
  });
  assert.ok(!resposta.body.includes("falha simulada"), "detalhe interno não vaza");
  assert.ok(!eventos.some((e) => e.tipo === "concluido"));
  await app.close();
});
