import { GoogleGenAI } from "@google/genai";
import { consultarDisponibilidade, eConsultaValida } from "./index.js";
import { env } from "../../shared/env.js";

const ferramentaConsultarDisponibilidade = {
  type: "function" as const,
  name: "consultarDisponibilidade",
  description:
    "Consulta os horários disponíveis de uma profissional em uma data específica.",
  parameters: {
    type: "object" as const,
    properties: {
      profissionalId: {
        type: "string" as const,
        description: "Identificador da profissional.",
      },
      data: {
        type: "string" as const,
        description: "Data da consulta no formato YYYY-MM-DD.",
      },
    },
    required: ["profissionalId", "data"],
  },
};

const instrucoesAssistente = `Você consulta a disponibilidade de profissionais.
Baseie suas respostas nos resultados das ferramentas.

Quando consultarDisponibilidade retornar horarios vazio, informe que não encontrou horários para o profissional na data consultada.

Esse resultado não confirma se o profissional está cadastrado nem explica a ausência de horários. Não afirme que a agenda está lotada, que o profissional não trabalha naquele dia ou que ele não existe.

Quando houver horários, apresente somente os horários retornados.`;

async function main() {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const requestOptions = {
    timeout_ms: 60_000,
    retries: { strategy: "none" as const },
  };

  const inicioPrimeiraChamada = Date.now();
  console.log("Antes da primeira chamada à API");
  const resposta = await ai.interactions.create(
    {
      model: "gemini-3.8-flash",
      system_instruction: instrucoesAssistente,
      input: "O que você consegue fazer?",
      tools: [ferramentaConsultarDisponibilidade],
    },
    requestOptions,
  );
  console.log(
    `Depois da primeira chamada à API (${Date.now() - inicioPrimeiraChamada} ms)`,
  );

  let encontrouChamadaDeFerramenta = false;

  for (const step of resposta.steps) {
    if (step.type === "function_call" && step.name === "consultarDisponibilidade") {
      encontrouChamadaDeFerramenta = true;

      if (eConsultaValida(step.arguments)) {
        const resultado = consultarDisponibilidade(step.arguments);
        const inicioSegundaChamada = Date.now();
        console.log("Antes da segunda chamada à API");
        const respostaFinal = await ai.interactions.create(
          {
            model: "gemini-3.8-flash",
            previous_interaction_id: resposta.id,
            input: [
              {
                type: "function_result",
                name: step.name,
                call_id: step.id,
                result: [
                  {
                    type: "text",
                    text: JSON.stringify(resultado),
                  },
                ],
              },
            ],
          },
          requestOptions,
        );
        console.log(
          `Depois da segunda chamada à API (${Date.now() - inicioSegundaChamada} ms)`,
        );
        console.log("Resposta ao usuário:", respostaFinal.output_text);
      }
    }
  }

  if (!encontrouChamadaDeFerramenta) {
    console.log("A primeira resposta não solicitou uma ferramenta.");
    console.log("Resposta do modelo:", resposta.output_text);
  }
}

main().catch((erro: unknown) => {
  const erroDetalhado = erro as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
  };

  console.error("Falha ao consultar o Gemini.");
  console.error("Nome:", erroDetalhado.name ?? "indisponível");
  console.error("Mensagem:", erroDetalhado.message ?? "indisponível");
  console.error("Status:", erroDetalhado.status ?? "indisponível");
  process.exitCode = 1;
});
