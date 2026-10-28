import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "../agendamentos.js";
import { construirApp } from "../app.js";
import { abrirBanco } from "../banco.js";
import { INSTRUCOES_SYSTEM } from "../instrucoes.js";
import type { Registrador } from "../observabilidade.js";
import { criarProcessadorDeRodada, type ChamadorDeModelo, type RespostaDoModelo } from "../rodada.js";

// HTTP pelo Fastify dentro do processo (app.inject), banco em memória e
// modelo SIMULADO: nenhuma chamada à Groq, nenhuma porta aberta. Os tokens
// são fictícios (origem "simulado").
//
// Rodada: chamada 1 pede consultarDisponibilidade (180/25) → ferramenta →
// chamada 2, que varia por cenário.

type Linha = { nivel: "info" | "warn"; evento: Record<string, unknown> };

const PEDIR_DISPONIBILIDADE: RespostaDoModelo = {
  mensagem: {
    role: "assistant",
    content: null,
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

/** Erro SIMULADO do modelo; não traz uso. */
class ErroSimuladoDoModelo extends Error {
  codigo = "FALHA_SIMULADA_DO_MODELO";
}

async function rodar(segunda: () => Promise<RespostaDoModelo>) {
  const linhas: Linha[] = [];
  const registrador: Registrador = {
    info: (o) => linhas.push({ nivel: "info", evento: o as Record<string, unknown> }),
    warn: (o) => linhas.push({ nivel: "warn", evento: o as Record<string, unknown> }),
  };
  const modelo: ChamadorDeModelo = async (mensagens) =>
    mensagens.at(-1)!.role === "tool" ? segunda() : PEDIR_DISPONIBILIDADE;

  const banco = abrirBanco(":memory:");
  const agendamentos = new ServicoDeAgendamentos(banco);
  const app = construirApp({
    processarRodada: criarProcessadorDeRodada(modelo, {
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

  const conversaId = (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  const resposta = await app.inject({
    method: "POST",
    url: `/conversas/${conversaId}/mensagens`,
    payload: { texto: "Quais horários a Ana tem em 2026-10-20?" },
  });
  await app.close();
  banco.close();

  const resumos = linhas.filter((l) => l.evento.evento === "rodada.resumo");
  assert.equal(resumos.length, 1, "um único resumo por requisição");
  return { resposta, linhas, resumo: resumos[0]! };
}

function contadores(evento: Record<string, unknown>) {
  const { chamadasAoModelo, execucoesDeFerramenta, tokensEntrada, tokensSaida, chamadasSemUso, usoSimulado } = evento;
  return { chamadasAoModelo, execucoesDeFerramenta, tokensEntrada, tokensSaida, chamadasSemUso, usoSimulado };
}

test("uso completo: cobertura completa, tokens somados", async () => {
  const { resposta, resumo } = await rodar(async () => ({
    mensagem: { role: "assistant", content: "09:00 e 14:00." },
    uso: { tokensEntrada: 210, tokensSaida: 18, origem: "simulado" },
  }));
  assert.equal(resposta.statusCode, 200);
  assert.equal(resumo.evento.status, "sucesso");
  assert.deepEqual(contadores(resumo.evento), {
    chamadasAoModelo: 2, execucoesDeFerramenta: 1, tokensEntrada: 390, tokensSaida: 43,
    chamadasSemUso: 0, usoSimulado: true,
  });
});

test("segunda chamada bem-sucedida sem uso: conta uma vez, sem virar zero", async () => {
  const { resposta, linhas, resumo } = await rodar(async () => ({
    mensagem: { role: "assistant", content: "09:00 e 14:00." },
    uso: undefined,
  }));
  assert.equal(resposta.statusCode, 200);
  assert.deepEqual(contadores(resumo.evento), {
    chamadasAoModelo: 2, execucoesDeFerramenta: 1, tokensEntrada: 180, tokensSaida: 25,
    chamadasSemUso: 1, usoSimulado: true,
  });
  const segunda = linhas.find((l) => l.evento.numeroDaChamada === 2)!;
  assert.equal(segunda.evento.tokensEntrada, undefined);
  assert.equal(segunda.evento.tokensSaida, undefined);
});

test("segunda chamada falha sem uso: cobertura incompleta e HTTP inalterado", async () => {
  const { resposta, linhas, resumo } = await rodar(async () => {
    throw new ErroSimuladoDoModelo("falha simulada na segunda chamada");
  });

  // Comportamento HTTP anterior preservado.
  assert.equal(resposta.statusCode, 500);
  assert.equal(resposta.json().erro.codigo, "ERRO_INTERNO");

  // Todos os eventos da mesma requisição.
  const ids = new Set(linhas.map((l) => l.evento.requisicaoId));
  assert.equal(ids.size, 1);

  const segunda = linhas.find((l) => l.evento.evento === "modelo.chamada" && l.evento.numeroDaChamada === 2)!;
  assert.equal(segunda.nivel, "warn");
  assert.equal(segunda.evento.status, "falha");
  assert.equal(segunda.evento.codigoErro, "FALHA_SIMULADA_DO_MODELO");

  assert.equal(resumo.nivel, "warn");
  assert.equal(resumo.evento.status, "falha");
  assert.equal(resumo.evento.codigoErro, "FALHA_SIMULADA_DO_MODELO");
  // Tokens conhecidos da primeira chamada preservados; a falta do uso da
  // segunda aparece em chamadasSemUso, contada uma única vez.
  assert.deepEqual(contadores(resumo.evento), {
    chamadasAoModelo: 2, execucoesDeFerramenta: 1, tokensEntrada: 180, tokensSaida: 25,
    chamadasSemUso: 1, usoSimulado: true,
  });
});
