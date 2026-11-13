import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { construirApp } from "../app.js";
import { criarProdutorSimulado, type Produtor } from "../produtor.js";

// HTTP PELA REDE (servidor ouvindo numa porta local, cliente fetch do Node).
// Aqui dá para observar o que o app.inject não mostra: a chegada progressiva
// e a desconexão real. Não é o navegador nem o proxy do Vite.

type LinhaDeLog = { msg?: string; execucao?: string; indice?: number };

async function subir(produtor: Produtor) {
  const logs: LinhaDeLog[] = [];
  const app = construirApp({
    produtor,
    fastify: { logger: { level: "info", stream: { write: (l: string) => void logs.push(JSON.parse(l)) } } },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return { app, logs, url: `http://127.0.0.1:${port}/geracoes` };
}

function esperarAte(condicao: () => boolean, limiteMs = 2000): Promise<void> {
  const inicio = Date.now();
  return new Promise((resolve, reject) => {
    const tentar = () => {
      if (condicao()) return resolve();
      if (Date.now() - inicio > limiteMs) return reject(new Error("tempo esgotado"));
      setTimeout(tentar, 10);
    };
    tentar();
  });
}

test("os fragmentos chegam aos poucos, antes do fim da geração", async () => {
  const { app, url } = await subir(criarProdutorSimulado({ atrasoInicialMs: 50, intervaloMs: 40 }));
  const inicio = Date.now();
  const resposta = await fetch(url, { method: "POST" });
  const leitor = resposta.body!.getReader();
  const chegadas: number[] = [];
  for (;;) {
    const { done } = await leitor.read();
    if (done) break;
    chegadas.push(Date.now() - inicio);
  }
  // Com ~40 fragmentos a 40 ms, o primeiro pedaço chega muito antes do último.
  assert.ok(chegadas.length > 5, `pedaços recebidos: ${chegadas.length}`);
  assert.ok(chegadas.at(-1)! - chegadas[0]! > 500, `intervalo: ${chegadas[0]} → ${chegadas.at(-1)} ms`);
  await app.close();
});

test("abortar a requisição cancela o produtor e registra desconexão prematura", async () => {
  let produzidos = 0;
  let cancelado = false;
  const base = criarProdutorSimulado({ atrasoInicialMs: 20, intervaloMs: 40 });
  const produtor: Produtor = async function* (signal) {
    signal.addEventListener("abort", () => (cancelado = true), { once: true });
    for await (const texto of base(signal)) {
      produzidos++;
      yield texto;
    }
  };
  const { app, logs, url } = await subir(produtor);

  const controlador = new AbortController();
  const resposta = await fetch(url, { method: "POST", signal: controlador.signal });
  const leitor = resposta.body!.getReader();
  const decodificador = new TextDecoder();
  let recebido = "";
  while ((recebido.match(/\n/g) ?? []).length < 3) {
    const { value } = await leitor.read();
    recebido += decodificador.decode(value, { stream: true });
  }
  controlador.abort();

  await esperarAte(() => logs.some((l) => l.msg === "encerrada por desconexão do cliente"));
  assert.ok(cancelado, "o signal do produtor foi cancelado");
  assert.ok(logs.some((l) => l.msg === "conexão encerrada antes do fim; cancelando o produtor"));
  assert.ok(!logs.some((l) => l.msg === "encerrada normalmente"));

  const produzidosNoCancelamento = produzidos;
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(produzidos, produzidosNoCancelamento, "nenhum fragmento produzido depois do cancelamento");
  assert.ok(produzidos < 10, `produzidos: ${produzidos}`);
  await app.close();
});
