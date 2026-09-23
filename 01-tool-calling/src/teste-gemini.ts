import { GoogleGenAI } from "@google/genai";
import { env } from "../../shared/env.js";

async function main() {
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

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
