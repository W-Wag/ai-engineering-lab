import {
  INSTRUCOES_SYSTEM,
  processarRodada,
} from "../../../04-contexto/src/processar-rodada.js";
import { construirApp } from "./app.js";

// Servidor real: cada mensagem enviada aciona o processarRodada do módulo 04,
// que chama a Groq com a ferramenta de disponibilidade do módulo 03.
// A chave GROQ_API_KEY é lida só aqui no backend, a partir do .env da raiz.

const PORTA = 3001;

const app = construirApp({
  processarRodada,
  instrucoesSystem: INSTRUCOES_SYSTEM,
  fastify: { logger: true },
});

app.listen({ port: PORTA, host: "127.0.0.1" }).catch((falha: unknown) => {
  app.log.error(falha);
  process.exitCode = 1;
});
