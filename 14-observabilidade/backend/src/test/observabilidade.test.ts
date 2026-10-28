import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agoraMonotonico,
  criarContextoDeObservacao,
  diagnosticarErro,
  duracaoDesde,
  emitir,
  extrairUso,
  type Registrador,
} from "../observabilidade.js";

// Testes unitários da infraestrutura de observação. Não exercitam a
// instrumentação da rodada, que é implementada no exercício.

function capturar() {
  const linhas: { nivel: "info" | "warn"; objeto: Record<string, unknown>; mensagem?: string }[] = [];
  const registrador: Registrador = {
    info: (objeto, mensagem) => linhas.push({ nivel: "info", objeto: objeto as Record<string, unknown>, mensagem }),
    warn: (objeto, mensagem) => linhas.push({ nivel: "warn", objeto: objeto as Record<string, unknown>, mensagem }),
  };
  return { linhas, registrador };
}

test("relógio monotônico mede duração não negativa", async () => {
  const inicio = agoraMonotonico();
  await new Promise((r) => setTimeout(r, 20));
  const duracao = duracaoDesde(inicio);
  assert.ok(duracao >= 15, `duração ${duracao}`);
  assert.ok(agoraMonotonico() >= inicio);
});

test("uso: lê os campos da Groq e não inventa zero quando ausente", () => {
  assert.deepEqual(
    extrairUso({ usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 } }),
    { tokensEntrada: 120, tokensSaida: 30, origem: "groq" },
  );
  assert.equal(extrairUso({ usage: undefined }), undefined);
  assert.equal(extrairUso({}), undefined);
});

test("diagnóstico de erro: só código, nome e status, nunca a mensagem", () => {
  class ErroDaAplicacao extends Error {
    codigo = "SEM_RESPOSTA";
  }
  assert.deepEqual(diagnosticarErro(new ErroDaAplicacao("texto interno")), { codigoErro: "SEM_RESPOSTA" });

  const doSdk = Object.assign(new Error("Bearer gsk_segredo no texto"), { name: "RateLimitError", status: 429 });
  const diagnostico = diagnosticarErro(doSdk);
  assert.deepEqual(diagnostico, { codigoErro: "RateLimitError", statusErro: 429 });
  assert.ok(!JSON.stringify(diagnostico).includes("gsk_"));

  assert.deepEqual(diagnosticarErro("texto solto"), { codigoErro: "ErroDesconhecido" });
  assert.deepEqual(diagnosticarErro(null), { codigoErro: "ErroDesconhecido" });
});

test("emitir: sucesso em info, falha em warn, com instante de calendário", () => {
  const { linhas, registrador } = capturar();
  const base = { requisicaoId: "r1", conversaId: "c1" };
  emitir(registrador, { ...base, evento: "modelo.chamada", etapa: "modelo", numeroDaChamada: 1, duracaoMs: 12.3, status: "sucesso" });
  emitir(registrador, {
    ...base, evento: "ferramenta.execucao", etapa: "ferramenta", numeroDaExecucao: 1,
    ferramenta: "consultarDisponibilidade", duracaoMs: 1, status: "falha", codigoErro: "Error",
  });
  assert.deepEqual(linhas.map((l) => [l.nivel, l.mensagem]), [["info", "modelo.chamada"], ["warn", "ferramenta.execucao"]]);
  assert.equal(linhas[0]!.objeto.requisicaoId, "r1");
  assert.match(String(linhas[0]!.objeto.instante), /^\d{4}-\d{2}-\d{2}T/);
});

test("contexto de observação começa com contadores zerados e uso conhecido", () => {
  const { registrador } = capturar();
  const contexto = criarContextoDeObservacao("r1", "c1", registrador);
  assert.deepEqual(contexto.contadores, {
    chamadasAoModelo: 0, execucoesDeFerramenta: 0, tokensEntrada: 0, tokensSaida: 0,
    chamadasSemUso: 0, usoSimulado: false,
  });
  assert.equal(criarContextoDeObservacao("r2", "c1", registrador).contadores === contexto.contadores, false);
});
