import assert from "node:assert/strict";
import { test } from "node:test";
import { abrirBanco, popularDemonstracao } from "../banco.js";
import { gerarHashDeSenha, verificarSenha } from "../senha.js";
import { criarSessao, csrfConfere, encerrarSessao, validarSessao } from "../sessao.js";

// Testes de UNIDADE do hash de senha e da sessão (sem HTTP).

test("hash de senha: formato scrypt, sal aleatório e verificação", async () => {
  const a = await gerarHashDeSenha("segredo-de-teste");
  const b = await gerarHashDeSenha("segredo-de-teste");
  assert.match(a, /^scrypt\$131072\$8\$1\$/);
  assert.notEqual(a, b, "sais diferentes geram hashes diferentes");
  assert.ok(!a.includes("segredo-de-teste"));
  assert.equal(await verificarSenha("segredo-de-teste", a), true);
  assert.equal(await verificarSenha("outra", a), false);
  assert.equal(await verificarSenha("segredo-de-teste", "lixo"), false);
});

test("sessão: válida até expirar; o banco guarda o hash, não o token", async () => {
  const banco = abrirBanco();
  await popularDemonstracao(banco);
  const sessao = criarSessao(banco, "u-ana", 1_000, 500);

  const validada = validarSessao(banco, sessao.token, 1_200);
  assert.equal(validada?.usuario.id, "u-ana");
  assert.equal(validada?.csrfToken, sessao.csrfToken);

  const guardados = banco.prepare("SELECT token_hash FROM sessoes").all() as { token_hash: string }[];
  assert.ok(guardados.every((l) => l.token_hash !== sessao.token));

  assert.equal(validarSessao(banco, sessao.token, 1_500), null, "expirada");
  assert.equal(banco.prepare("SELECT COUNT(*) AS n FROM sessoes").get()!.n, 0, "expirada é apagada");
});

test("sessão: encerrar invalida; token desconhecido não vale", async () => {
  const banco = abrirBanco();
  await popularDemonstracao(banco);
  const sessao = criarSessao(banco, "u-carlos", 0, 10_000);
  encerrarSessao(banco, sessao.token);
  assert.equal(validarSessao(banco, sessao.token, 1), null);
  assert.equal(validarSessao(banco, "token-inventado", 1), null);
});

test("csrfConfere compara exatamente e recusa ausência", () => {
  assert.equal(csrfConfere("abc", "abc"), true);
  assert.equal(csrfConfere("abd", "abc"), false);
  assert.equal(csrfConfere("ab", "abc"), false);
  assert.equal(csrfConfere(undefined, "abc"), false);
});
