import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "./agendamentos.js";
import { construirApp } from "./app.js";
import { abrirBanco } from "./banco.js";
import { INSTRUCOES_SYSTEM } from "./instrucoes.js";
import type { Registrador } from "./observabilidade.js";
import { criarProcessadorDeRodada, type ChamadorDeModelo } from "./rodada.js";

// SIMULAÇÃO, sem Groq e sem rede: app.inject (Fastify dentro do processo),
// banco em memória e um modelo fictício. Os tokens são FICTÍCIOS
// (origem "simulado") e servem só para conferir a instrumentação.
//
// Uso (na pasta backend): npm run simular
// Com "sem-uso", a segunda chamada ao modelo não informa tokens:
//   npm run simular -- sem-uso
// Com "falha-na-segunda", a segunda chamada lança um erro simulado, sem uso:
//   npm run simular -- falha-na-segunda

const segundaSemUso = process.argv.includes("sem-uso");
const segundaFalha = process.argv.includes("falha-na-segunda");

/** Erro SIMULADO do modelo; o código deixa claro que não veio da Groq. */
class ErroSimuladoDoModelo extends Error {
  codigo = "FALHA_SIMULADA_DO_MODELO";
}

// Modelo fictício: na primeira chamada pede a ferramenta; depois do resultado,
// responde em texto (ou falha, com "falha-na-segunda"). Tempo de resposta
// fixo de 30 ms para ver a duração.
const modeloFicticio: ChamadorDeModelo = async (mensagens) => {
  await new Promise((r) => setTimeout(r, 30));
  const ultima = mensagens.at(-1)!;

  if (ultima.role === "tool") {
    if (segundaFalha) {
      throw new ErroSimuladoDoModelo("falha simulada na segunda chamada");
    }
    return {
      mensagem: { role: "assistant", content: "Ana tem 09:00 e 14:00 em 2026-10-20.", refusal: null },
      uso: segundaSemUso ? undefined : { tokensEntrada: 210, tokensSaida: 18, origem: "simulado" },
    };
  }

  return {
    mensagem: {
      role: "assistant",
      content: null,
      refusal: null,
      tool_calls: [{
        id: "simulado-1",
        type: "function",
        function: {
          name: "consultarDisponibilidade",
          arguments: JSON.stringify({ profissionalId: "ana", data: "2026-10-20" }),
        },
      }],
    },
    uso: { tokensEntrada: 180, tokensSaida: 25, origem: "simulado" },
  };
};

// Mostra cada evento numa linha, como sairia no log.
const registrador: Registrador = {
  info: (objeto) => console.log(JSON.stringify(objeto)),
  warn: (objeto) => console.log(JSON.stringify({ nivel: "warn", ...objeto })),
};

const banco = abrirBanco(":memory:");
const agendamentos = new ServicoDeAgendamentos(banco);
const app = construirApp({
  processarRodada: criarProcessadorDeRodada(modeloFicticio, {
    buscarPoliticas: async () => ({ encontrado: false }),
    agendamentos,
    sessao: SESSAO_FICTICIA,
  }),
  instrucoesSystem: INSTRUCOES_SYSTEM,
  banco,
  agendamentos,
  sessao: SESSAO_FICTICIA,
  registradorDeEventos: registrador,
});

console.log("SIMULAÇÃO: modelo fictício, tokens fictícios, sem Groq.\n");
const conversaId = (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
const resposta = await app.inject({
  method: "POST",
  url: `/conversas/${conversaId}/mensagens`,
  payload: { texto: "Quais horários a Ana tem em 2026-10-20?" },
});
console.log(`\nresposta HTTP: ${resposta.statusCode} ${resposta.json().resposta ?? resposta.body}`);
await app.close();
banco.close();
