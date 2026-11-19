import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { criarAmbiente } from "./ambiente.js";

// HTTP PELA REDE: servidor numa porta local e fetch do Node levando o cookie
// à mão. Confere o cabeçalho Set-Cookie real e o ciclo login → sessão →
// logout. Não é o navegador nem o proxy do Vite.

test("login, sessão e logout pela rede", async () => {
  const { app } = await criarAmbiente();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const login = await fetch(`${base}/sessao`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "ana", senha: "ana-demo-local" }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie")!;
  assert.match(setCookie, /^sessao=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0]!;
  const { csrfToken } = (await login.json()) as { csrfToken: string };

  const sessao = await fetch(`${base}/sessao`, { headers: { cookie } });
  assert.equal(sessao.status, 200);

  const saida = await fetch(`${base}/sessao`, {
    method: "DELETE",
    headers: { cookie, "x-csrf-token": csrfToken },
  });
  assert.equal(saida.status, 204);
  assert.match(saida.headers.get("set-cookie")!, /^sessao=;/);

  assert.equal((await fetch(`${base}/sessao`, { headers: { cookie } })).status, 401);
  await app.close();
});
