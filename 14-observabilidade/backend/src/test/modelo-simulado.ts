import type Groq from "groq-sdk";
import type { Mensagem } from "../conversas.js";
import type { ChamadorDeModelo } from "../rodada.js";

/** Modelo simulado dos módulos anteriores: devolve só a mensagem. */
export type ModeloSimples = (
  mensagens: readonly Mensagem[],
  ferramentas: Groq.Chat.ChatCompletionTool[],
) => Promise<Groq.Chat.ChatCompletionMessage | undefined>;

/**
 * Adapta um modelo simples ao contrato atual, sem informação de uso: estes
 * testes não tratam de consumo.
 */
export function semUso(modelo: ModeloSimples): ChamadorDeModelo {
  return async (mensagens, ferramentas) => ({
    mensagem: await modelo(mensagens, ferramentas),
    uso: undefined,
  });
}
