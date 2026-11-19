import { construirApp, type OpcoesDoApp } from "../app.js";
import { abrirBanco, popularDemonstracao } from "../banco.js";
import { criarModeloSimulado } from "../modelo.js";

// Ambiente de teste: banco em memória com os dados de demonstração, modelo
// simulado observável e relógio controlável. Tudo local ao processo do teste.

export async function criarAmbiente(extras: Partial<OpcoesDoApp> = {}) {
  const banco = abrirBanco();
  await popularDemonstracao(banco);
  const modelo = criarModeloSimulado();
  const relogio = { agora: Date.parse("2026-11-18T12:00:00Z") };
  const app = construirApp({ banco, modelo, agora: () => relogio.agora, ...extras });
  await app.ready();
  return { app, banco, modelo, relogio };
}

type App = Awaited<ReturnType<typeof criarAmbiente>>["app"];

/** Faz login por app.inject e devolve o cookie e o token CSRF. */
export async function entrar(app: App, login: string, senha: string) {
  const resposta = await app.inject({ method: "POST", url: "/sessao", payload: { login, senha } });
  const cookie = resposta.cookies.find((c) => c.name === "sessao");
  if (resposta.statusCode !== 200 || !cookie) throw new Error(`login falhou: ${resposta.statusCode}`);
  return {
    cookies: { sessao: cookie.value },
    csrf: resposta.json<{ csrfToken: string }>().csrfToken,
  };
}
