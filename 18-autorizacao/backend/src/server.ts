import { construirApp } from "./app.js";
import { abrirBanco, CONTAS_DE_DEMONSTRACAO, popularDemonstracao } from "./banco.js";
import { criarModeloSimulado } from "./modelo.js";

// Servidor LOCAL de estudo. Banco em memória: cada início recomeça com as
// contas e conversas de demonstração. Sem modelo real, sem chave, sem rede
// externa. O frontend (Vite) repassa /sessao e /conversas para cá.

const PORTA = 3001;

const banco = abrirBanco();
await popularDemonstracao(banco);

const app = construirApp({
  banco,
  modelo: criarModeloSimulado(),
  cookieSeguro: false, // HTTP local; em HTTPS, true (ver app.ts)
  fastify: { logger: true },
});

await app.listen({ port: PORTA, host: "127.0.0.1" });
app.log.info(
  { contas: CONTAS_DE_DEMONSTRACAO.map((c) => c.login) },
  "contas de DEMONSTRAÇÃO LOCAL disponíveis (não são contas reais)",
);
