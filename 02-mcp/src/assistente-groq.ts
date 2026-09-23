import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import Groq from "groq-sdk";
import { env } from "../../shared/env.js";

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

  const cliente = new Client({
    name: "cliente-de-estudo",
    version: "1.0.0",
  });

  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/server.ts"],
  });

  try {
    await cliente.connect(transporte);

    const { tools: ferramentas } = await cliente.listTools();

    const ferramentasParaModelo = ferramentas.map((ferramenta) => ({
      type: "function" as const,
      function: {
        name: ferramenta.name,
        description: ferramenta.description ?? "",
        parameters: ferramenta.inputSchema,
      },
    }));

    console.log(
      "Ferramentas disponíveis",
      ferramentas.map((ferramenta) => ferramenta.name),
    );

    const mensagens: Groq.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "Você ajuda a consultar a disponibilidade de profissionais. " +
          "Use a ferramenta disponível para consultar horários. " +
          "Se faltar o profissional ou a data, peça esclarecimento. " +
          "Não invente horários nem argumentos ausentes.",
      },
      {
        role: "user",
        content:
          "O'que você sabe fazer?",
      },
    ];

    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: mensagens,
      tools: ferramentasParaModelo,
      tool_choice: "auto",
    });

    const mensagem = resposta.choices[0]?.message;

    if (!mensagem) {
      throw new Error("A API não retornou uma mensagem.");
    }

    if (mensagem.tool_calls?.length) {
      mensagens.push(mensagem);
      for (const chamada of mensagem.tool_calls) {
        console.log("Ferramenta solicitada:", chamada.function.name);
        console.log("Argumentos:", chamada.function.arguments);

        const dados: unknown = JSON.parse(chamada.function.arguments);

        if (
          typeof dados !== "object" ||
          dados === null ||
          Array.isArray(dados)
        ) {
          console.error("Os argumentos devem ser um objeto.");
          return;
        }

        const argumentos = dados as Record<string, unknown>;

        const resultado = await cliente.callTool({
          name: chamada.function.name,
          arguments: argumentos,
        });

        mensagens.push({
          role: "tool",
          tool_call_id: chamada.id,
          content: JSON.stringify(resultado),
        });

        console.dir(resultado, { depth: null });
      }

      const respostaFinal = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: mensagens,
      });

      console.log(
        "Resposta ao usuário: ",
        respostaFinal.choices[0]?.message.content ?? "Resposta sem texto.",
      );
    } else {
      console.log("Resposta sem ferramenta:", mensagem.content);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await cliente.close();
  }

  console.error("main() concluído");
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
