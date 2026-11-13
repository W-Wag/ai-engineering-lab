import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { TEXTO_FIXO, criarProdutorSimulado, dividirEmFragmentos, esperar } from "../produtor.js";

// Testes de unidade do produtor simulado (sem HTTP).

test("os fragmentos, juntos, reproduzem o texto fixo", async () => {
  const produtor = criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 0 });
  const recebidos: string[] = [];
  for await (const texto of produtor(new AbortController().signal)) recebidos.push(texto);
  assert.equal(recebidos.join(""), TEXTO_FIXO);
  assert.equal(recebidos.length, dividirEmFragmentos(TEXTO_FIXO).length);
});

test("esperar remove o listener do signal quando termina pelo tempo", async () => {
  const controlador = new AbortController();
  await esperar(5, controlador.signal);
  assert.equal(getEventListeners(controlador.signal, "abort").length, 0);
});

test("esperar é cancelada pelo signal e não deixa listener", async () => {
  const controlador = new AbortController();
  const espera = esperar(60_000, controlador.signal);
  controlador.abort(new Error("cancelado no teste"));
  await assert.rejects(espera, /cancelado no teste/);
  assert.equal(getEventListeners(controlador.signal, "abort").length, 0);
});

test("o produtor para de produzir depois do cancelamento", async () => {
  const produtor = criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 5 });
  const controlador = new AbortController();
  const recebidos: string[] = [];
  await assert.rejects(async () => {
    for await (const texto of produtor(controlador.signal)) {
      recebidos.push(texto);
      if (recebidos.length === 3) controlador.abort(new Error("parou"));
    }
  }, /parou/);
  assert.equal(recebidos.length, 3);
});

test("a falha simulada acontece depois da quantidade pedida", async () => {
  const produtor = criarProdutorSimulado({ atrasoInicialMs: 0, intervaloMs: 0, falharDepoisDe: 2 });
  const recebidos: string[] = [];
  await assert.rejects(async () => {
    for await (const texto of produtor(new AbortController().signal)) recebidos.push(texto);
  }, /falha simulada/);
  assert.equal(recebidos.length, 2);
});
