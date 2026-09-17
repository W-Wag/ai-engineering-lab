import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { consultarDisponibilidade, eConsultaValida } from "./index.js";

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

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não foi encontrada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const resposta = await ai.interactions.create({
    model: "gemini-3.8-flash",
    input: "Quais horários a profissional carlos tem em 20 de outubro de 2026?",
    tools: [ferramentaConsultarDisponibilidade],
  });

  for (const step of resposta.steps) {
    if (step.type === "function_call") {
      if (step.name === "consultarDisponibilidade") {
        if (eConsultaValida(step.arguments)) {
          const resultado = consultarDisponibilidade(step.arguments);
          console.log(resultado)
          // const respostaFinal = await ai.interactions.create({
          //   model: "gemini-3.8-flash",
          //   previous_interaction_id: resposta.id,
          //   input: [
          //     {
          //       type: "function_result",
          //       name: step.name,
          //       call_id: step.id,
          //       result: [
          //         {
          //           type: "text",
          //           text: JSON.stringify(resultado),
          //         },
          //       ],
          //     },
          //   ],
          // });

          // console.log("Resposta ao usuário:", respostaFinal.output_text);
        }
      }
    }
  }
}

main().catch((erro: unknown) => {
  console.error(
    erro instanceof Error ? erro.message : "Falha ao consultar o Gemini.",
  );
  process.exitCode = 1;
});
