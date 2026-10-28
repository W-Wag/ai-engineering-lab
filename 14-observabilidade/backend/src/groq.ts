import Groq from "groq-sdk";
import { env } from "../../../shared/env.js";
import { extrairUso } from "./observabilidade.js";
import type { ChamadorDeModelo } from "./rodada.js";

/**
 * Chamada real ao modelo, com a mesma configuração do módulo 04: uma
 * tentativa, sem retries. A chave é lida só aqui, no backend. Devolve também
 * o uso de tokens informado pela Groq, quando houver.
 */
export const chamarModeloGroq: ChamadorDeModelo = async (
  mensagens,
  ferramentas,
) => {
  const groq = new Groq({
    apiKey: env.GROQ_API_KEY,
    timeout: 30_000,
    maxRetries: 0,
  });

  const resposta = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [...mensagens],
    tools: ferramentas,
    tool_choice: "auto",
  });

  return {
    mensagem: resposta.choices[0]?.message,
    uso: extrairUso(resposta),
  };
};
