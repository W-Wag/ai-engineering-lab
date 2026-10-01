import Groq from "groq-sdk";
import { pathToFileURL } from "node:url";
import { env } from "../../shared/env.js";
import {
  consultarDisponibilidade,
  eConsultaValida,
  Disponibilidade,
} from "../../03-harness/src/disponibilidade.js";

export const INSTRUCOES_SYSTEM = [
  "Você consulta disponibilidade de profissionais.",
  "Use a ferramenta para obter horários e não invente resultados.",
  "Peça esclarecimento se faltarem informações.",
  "Quando a ferramenta retornar horarios: [], informe apenas que não encontrou horários para o profissional e a data consultados.",
  "Esse resultado não permite afirmar que a agenda está lotada, que o profissional está indisponível, que não trabalha naquele dia ou que não existe.",
  "Não atribua uma causa à ausência de horários.",
  "Você pode apenas consultar disponibilidade.",
  "Não pode criar, reservar, alterar ou cancelar agendamentos.",
  "Não ofereça essas operações como se estivessem disponíveis.",
  "Neste contexto, a profissional Ana possui o identificador 'ana'.",
  "Neste contexto, o profissional Carlos possui o identificador 'carlos'.",
].join(" ");

export type Mensagem = Groq.Chat.ChatCompletionMessageParam;

export function criarFerramentas(): Groq.Chat.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "consultarDisponibilidade",
        description: "Consulta os horários disponíveis de um profissional em uma data.",
        parameters: {
          type: "object",
          properties: {
            profissionalId: {
              type: "string",
              description: "Identificador do profissional",
            },
            data: {
              type: "string",
              description: "Data no formato YYYY-MM-DD",
            },
          },
          required: ["profissionalId", "data"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export async function processarRodada(
  mensagens: readonly Mensagem[],
): Promise<Mensagem[]> {
  const groq = new Groq({
    apiKey: env.GROQ_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });

  const resposta = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [...mensagens],
    tools: criarFerramentas(),
    tool_choice: "auto",
  });

  const mensagem = resposta.choices[0]?.message;
  if (!mensagem) {
    throw new Error("O modelo não retornou uma mensagem.");
  }

  const novasMensagens: Mensagem[] = [mensagem];
  for (const chamada of mensagem.tool_calls ?? []) {
    if (chamada.function.name !== "consultarDisponibilidade") {
      throw new Error(`Ferramenta desconhecida: ${chamada.function.name}`);
    }

    let argumentos: unknown;
    try {
      argumentos = JSON.parse(chamada.function.arguments);
    } catch {
      throw new Error("Argumentos inválidos: JSON malformado.");
    }

    if (!eConsultaValida(argumentos)) {
      throw new Error("Argumentos inválidos para consultarDisponibilidade.");
    }

    const resultado: Disponibilidade = consultarDisponibilidade(argumentos);
    novasMensagens.push({
      role: "tool",
      tool_call_id: chamada.id,
      content: JSON.stringify(resultado),
    });
  }

  return novasMensagens;
}

async function exemploDireto(): Promise<void> {
  const mensagens: Mensagem[] = [
    { role: "system", content: INSTRUCOES_SYSTEM },
    { role: "user", content: "Quais horários a Ana tem disponíveis?" },
  ];
  const novas = await processarRodada(mensagens);
  console.dir(novas, { depth: null });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exemploDireto().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  });
}
