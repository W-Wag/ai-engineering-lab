import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "./agendamentos.js";
import { construirApp } from "./app.js";
import { abrirBanco } from "./banco.js";
import { chamarModeloGroq } from "./groq.js";
import { INSTRUCOES_SYSTEM } from "./instrucoes.js";
import { buscarPoliticas } from "./politicas.js";
import { criarProcessadorDeRodada } from "./rodada.js";

// Servidor real: mesmas ferramentas e rotas do módulo 12, com o estado no
// SQLite. A chave GROQ_API_KEY é lida só aqui no backend, a partir do .env da
// raiz. A confirmação pelo botão não chama a Groq.

const PORTA = 3001;

// Arquivo do banco, fora do Git (backend/dados/ está no .gitignore).
// Reiniciar o backend mantém o estado; apagar o arquivo o descarta.
// A variável CAMINHO_DO_BANCO permite usar outro arquivo (por exemplo, num
// teste manual descartável).
const CAMINHO_DO_BANCO =
  process.env.CAMINHO_DO_BANCO ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../dados/agenda.sqlite");

const banco = abrirBanco(CAMINHO_DO_BANCO);

// Um único serviço, compartilhado pela ferramenta de propostas e pela rota de
// confirmação.
const agendamentos = new ServicoDeAgendamentos(banco);

// Investigação do módulo 13: FALHAR_APOS_CRIAR=1 faz a confirmação que cria
// um agendamento responder HTTP 500 depois das gravações. Qualquer outro valor,
// ou a variável ausente, mantém o comportamento normal.
const FALHAR_APOS_CRIAR = process.env.FALHAR_APOS_CRIAR === "1";

const app = construirApp({
  processarRodada: criarProcessadorDeRodada(chamarModeloGroq, {
    buscarPoliticas,
    agendamentos,
    sessao: SESSAO_FICTICIA,
  }),
  instrucoesSystem: INSTRUCOES_SYSTEM,
  banco,
  agendamentos,
  sessao: SESSAO_FICTICIA,
  falharAposCriar: FALHAR_APOS_CRIAR,
  fastify: { logger: true },
});

// Identifica este processo no log: PID, arquivo do banco e se a falha simulada
// está ligada. Serve para conferir que houve reinício e com qual configuração.
app.log.info(
  { pid: process.pid, banco: CAMINHO_DO_BANCO, falharAposCriar: FALHAR_APOS_CRIAR },
  "backend do módulo 14 iniciado",
);

app.listen({ port: PORTA, host: "127.0.0.1" }).catch((falha: unknown) => {
  app.log.error(falha);
  process.exitCode = 1;
});

// Fecha a conexão ao encerrar (Ctrl+C), para não deixar o arquivo em uso.
process.on("SIGINT", () => {
  app.close().finally(() => {
    banco.close();
    process.exit(0);
  });
});
