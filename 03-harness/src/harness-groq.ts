import Groq from "groq-sdk";
import { env } from "../../shared/env.js";
import {
  consultarDisponibilidade,
  eConsultaValida,
} from "./disponibilidade.js";
import { ChatCompletionToolMessageParam } from "groq-sdk/resources/chat.mjs";

async function main() {
  const apiKey = env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY não foi encontrada.");
  }

  const groq = new Groq({
    apiKey,
    timeout: 30_000,
    maxRetries: 0,
  });

  try {
    const ferramentas: Groq.Chat.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "consultarDisponibilidade",
          description:
            "Consulta os horários disponíveis de um profissional em uma data.",
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

    const mensagens: Groq.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: [
          "Você consulta disponibilidade de profissionais.",
          "Use a ferramenta para obter horários e não invente resultados.",
          "Peça esclarecimento se faltarem informações.",
          "Uma lista vazia significa apenas que não foram encontrados horários.",
          "Você pode apenas consultar disponibilidade.",
          "Não pode criar, reservar, alterar ou cancelar agendamentos.",
          "Não ofereça essas operações como se estivessem disponíveis.",
        ].join(" "),
      },
      {
        role: "user",
        content:
          "Consulte os horários de Carlos em 20 de outubro de 2026. " +
          "Use o identificador carlos. Se não encontrar horários, " +
          "consulte Ana, identificador ana, na mesma data.",
      },
    ];

    let limiteDeChamadas = 3;

    let motivoEncerramento:
      | "resposta_final"
      | "sem_resposta"
      | "limite_atingido"
      | "ferramenta_desconhecida"
      | "erro_ferramenta" = "limite_atingido";

    for (let i = 0; i < limiteDeChamadas; i++) {
      const resposta = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: mensagens,
        tools: ferramentas,
        tool_choice: "auto",
      });

      const mensagem = resposta.choices[0]?.message;

      if (!mensagem) {
        motivoEncerramento = "erro_ferramenta";
        throw new Error("O modelo não retornou uma mensagem");
      }

      console.dir(
        {
          texto: mensagem.content,
          chamadas: mensagem.tool_calls,
        },
        { depth: null },
      );

      mensagens.push(mensagem);

      const chamadas = mensagem.tool_calls ?? [];

      if (chamadas.length === 0 && mensagem.content) {
        motivoEncerramento = "resposta_final";
        console.log("Resposta final: ", mensagem.content);
        break;
      }

      if (chamadas.length === 0) {
        motivoEncerramento = "sem_resposta";
        console.log("Sem mais respostas.");
      }

      for (const tcall of chamadas) {
        if (tcall.function.name !== "consultarDisponibilidade") {
          motivoEncerramento = "ferramenta_desconhecida";
          throw new Error("A ferramenta solicitada não existe");
        }
        const argumentos: unknown = JSON.parse(tcall.function.arguments);

        if (eConsultaValida(argumentos)) {
          const resultado = consultarDisponibilidade(argumentos);
          console.log("Resultado local:", resultado);
          const novaMensagem: ChatCompletionToolMessageParam = {
            role: "tool",
            tool_call_id: tcall.id,
            content: JSON.stringify(resultado),
          };

          mensagens.push(novaMensagem);
          console.log(
            "Resultado adicionado ao histórico para a chamada:",
            tcall.id,
          );
        } else {
          throw new Error("Os argumentos não estão válidos.");
        }
      }
    }

    console.log("Motivo do encerramento: ", motivoEncerramento);
  } catch (err) {
    console.error(err);
  }

  console.error("main() concluído");
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
