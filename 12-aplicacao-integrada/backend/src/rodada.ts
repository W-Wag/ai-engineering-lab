import type Groq from "groq-sdk";
import type { SessaoAutenticada } from "../../../09-acoes-seguras/src/tipos.js";
import type { PropostaExibida, ServicoDeAgendamentos } from "./agendamentos.js";
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

export type DependenciasDaRodada = {
  buscarPoliticas: BuscadorDePoliticas;
  agendamentos: ServicoDeAgendamentos;
  sessao: SessaoAutenticada;
};

/**
 * Monta o processamento de uma rodada: chama o modelo e executa as
 * ferramentas pedidas. Devolve as mensagens novas e o que as ferramentas
 * produziram nesta rodada: fontes e propostas.
 */
export function criarProcessadorDeRodada(
  chamarModelo: ChamadorDeModelo,
  dependencias: DependenciasDaRodada,
): ProcessadorDeRodada {
  const ferramentas = criarDefinicoesDeFerramentas();

  return async (mensagens, { conversaId }) => {
    const mensagem = await chamarModelo(mensagens, ferramentas);
    if (mensagem === undefined) {
      return { mensagens: [], fontes: [], propostas: [] };
    }

    const novas: Mensagem[] = [mensagem];
    const fontes: FonteConsultada[] = [];
    const propostas: PropostaExibida[] = [];

    for (const chamada of mensagem.tool_calls ?? []) {
      const resultado = await executarChamada(chamada, {
        ...dependencias,
        conversaId,
      });
      novas.push(resultado.mensagem);
      fontes.push(...resultado.fontes);
      propostas.push(...resultado.propostas);
    }

    return { mensagens: novas, fontes, propostas };
  };
}
