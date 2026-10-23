import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "./agendamentos.js";
import { construirApp } from "./app.js";
import { chamarModeloGroq } from "./groq.js";
import { INSTRUCOES_SYSTEM } from "./instrucoes.js";
import { buscarPoliticas } from "./politicas.js";
import { criarProcessadorDeRodada } from "./rodada.js";

// Servidor real: cada mensagem enviada chama a Groq, com as ferramentas
// consultarDisponibilidade (módulo 03), consultarPoliticas (manual do módulo
// 07, com embeddings locais do módulo 06 e ranking do módulo 08) e
// prepararPropostaAgendamento. A confirmação pelo botão não chama a Groq.
// A chave GROQ_API_KEY é lida só aqui no backend, a partir do .env da raiz.

const PORTA = 3001;

// Um único serviço, compartilhado pela ferramenta de propostas e pela rota de
// confirmação.
const agendamentos = new ServicoDeAgendamentos();

const app = construirApp({
  processarRodada: criarProcessadorDeRodada(chamarModeloGroq, {
    buscarPoliticas,
    agendamentos,
    sessao: SESSAO_FICTICIA,
  }),
  instrucoesSystem: INSTRUCOES_SYSTEM,
  agendamentos,
  sessao: SESSAO_FICTICIA,
  fastify: { logger: true },
});

app.listen({ port: PORTA, host: "127.0.0.1" }).catch((falha: unknown) => {
  app.log.error(falha);
  process.exitCode = 1;
});
