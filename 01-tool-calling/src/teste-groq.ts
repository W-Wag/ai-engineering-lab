import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
});
import Groq from "groq-sdk";

async function main() {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY não foi encontrada.");
  }

  const groq = new Groq({
    apiKey,
    timeout: 30_000,
    maxRetries: 0,
  });

  const inicio = Date.now();
  console.log("Enviando mensagem à Groq...");

  const resposta = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "user",
        content: "Estamos estudando MCP, Model Context Protocol, no contexto de aplicações de IA. Explique em uma frase, em português, o que é uma ferramenta disponibilizada por um servidor MCP.",
      },
    ],
  });

  console.log(`Resposta recebida em ${Date.now() - inicio} ms`);
  console.log(resposta.choices[0]?.message.content ?? "Resposta sem texto.");
}

main().catch((erro: unknown) => {
  if (erro instanceof Groq.APIError) {
    console.error("Nome:", erro.name);
    console.error("Status:", erro.status ?? "indisponível");
    console.error("Mensagem:", erro.message);
  } else {
    console.error(erro instanceof Error ? erro.message : "Erro inesperado.");
  }

  process.exitCode = 1;
});
