import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não foi encontrada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const resposta = await ai.interactions.create({
    model: "gemini-3.8-flash",
    input: "Explique em uma frase o que é uma função em programação.",
  });

  console.log(resposta.output_text);
}

main().catch((erro: unknown) => {
  console.error(
    erro instanceof Error ? erro.message : "Falha ao consultar o Gemini."
  );
  process.exitCode = 1;
});