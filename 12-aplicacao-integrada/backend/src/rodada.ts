import type Groq from "groq-sdk";
import type {
  FonteConsultada,
  Mensagem,
  ProcessadorDeRodada,
} from "./conversas.js";
import {
  criarDefinicoesDeFerramentas,
  executarChamada,
  type BuscadorDePoliticas,
} from "./ferramentas.js";

/**
 * Uma chamada ao modelo. Em execução real, a Groq (groq.ts); nas
 * verificações, uma simulação. Devolve undefined se não houver mensagem.
 */
export type ChamadorDeModelo = (
  mensagens: readonly Mensagem[],
  ferramentas: Groq.Chat.ChatCompletionTool[],
) => Promise<Groq.Chat.ChatCompletionMessage | undefined>;

/**
 * Monta o processamento de uma rodada: chama o modelo e executa as
 * ferramentas pedidas. Devolve as mensagens novas e as fontes trazidas pelas
 * ferramentas nesta rodada.
 */
export function criarProcessadorDeRodada(
  chamarModelo: ChamadorDeModelo,
  buscarPoliticas: BuscadorDePoliticas,
): ProcessadorDeRodada {
  const ferramentas = criarDefinicoesDeFerramentas();

  return async (mensagens) => {
    const mensagem = await chamarModelo(mensagens, ferramentas);
    if (mensagem === undefined) {
      return { mensagens: [], fontes: [] };
    }

    const novas: Mensagem[] = [mensagem];
    const fontes: FonteConsultada[] = [];

    for (const chamada of mensagem.tool_calls ?? []) {
      const resultado = await executarChamada(chamada, buscarPoliticas);
      novas.push(resultado.mensagem);
      fontes.push(...resultado.fontes);
    }

    return { mensagens: novas, fontes };
  };
}
