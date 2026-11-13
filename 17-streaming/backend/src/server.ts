import { construirApp } from "./app.js";
import { criarProdutorSimulado } from "./produtor.js";

// Servidor de desenvolvimento: produtor simulado com texto fixo. Sem chave,
// sem modelo, sem banco. O frontend (Vite) repassa /geracoes para cá.
//
// Investigação (cenário 2): `npm run start:incompleto` passa
// --fluxo-incompleto, e cada geração fecha a resposta depois de 6 deltas,
// sem "concluido" nem "erro". Sem a opção, o fluxo é o normal.

const PORTA = 3001;
const fluxoIncompleto = process.argv.includes("--fluxo-incompleto");

const app = construirApp({
  produtor: criarProdutorSimulado({ atrasoInicialMs: 1200, intervaloMs: 250 }),
  fastify: { logger: true },
  ...(fluxoIncompleto ? { encerrarSemTerminalDepoisDe: 6 } : {}),
});

app.listen({ port: PORTA, host: "127.0.0.1" }).then(() => {
  if (fluxoIncompleto) app.log.warn("CENÁRIO ATIVO: fluxo incompleto (fecha após 6 deltas, sem evento terminal)");
}).catch((falha: unknown) => {
  app.log.error(falha);
  process.exitCode = 1;
});
