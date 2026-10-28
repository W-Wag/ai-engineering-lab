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
import {
  agoraMonotonico,
  diagnosticarErro,
  duracaoDesde,
  emitir,
  type UsoDaChamada,
} from "./observabilidade.js";

/** O que uma chamada ao modelo devolve: a mensagem e, se informado, o uso. */
export type RespostaDoModelo = {
  /** undefined se o modelo não devolveu mensagem. */
  mensagem: Groq.Chat.ChatCompletionMessage | undefined;
  /** undefined se o provedor não informou tokens: não é consumo zero. */
  uso: UsoDaChamada | undefined;
};

/**
 * Uma chamada ao modelo. Em execução real, a Groq (groq.ts); nas
 * verificações, uma simulação.
 */
export type ChamadorDeModelo = (
  mensagens: readonly Mensagem[],
  ferramentas: Groq.Chat.ChatCompletionTool[],
) => Promise<RespostaDoModelo>;

export type DependenciasDaRodada = {
  buscarPoliticas: BuscadorDePoliticas;
  agendamentos: ServicoDeAgendamentos;
  sessao: SessaoAutenticada;
};

/**
 * Monta o processamento de uma rodada: chama o modelo e executa as
 * ferramentas pedidas. Devolve as mensagens novas e o que as ferramentas
 * produziram nesta rodada: fontes e propostas.
 *
 * `observacao` chega quando a rota de mensagens a cria (ver app.ts). Ela é a
 * mesma em todas as rodadas de uma requisição: os contadores continuam de uma
 * rodada para a outra.
 */
export function criarProcessadorDeRodada(
  chamarModelo: ChamadorDeModelo,
  dependencias: DependenciasDaRodada,
): ProcessadorDeRodada {
  const ferramentas = criarDefinicoesDeFerramentas();

  return async (mensagens, { conversaId, observacao }) => {
    // Disponíveis para os TODOs: observacao (requisicaoId, conversaId,
    // registrador, contadores), agoraMonotonico, duracaoDesde,
    // diagnosticarErro e emitir, de ./observabilidade.ts.

    // TODO 2: meça esta chamada ao modelo, do início ao fim, e emita um
    // evento "modelo.chamada" com numeroDaChamada, duracaoMs e status.
    // TODO 2.1: se a chamada lançar erro, emita o evento com status "falha"
    // e o código seguro do erro, e relance o mesmo erro, sem retry.
    // TODO 4: conte a chamada em observacao.contadores.chamadasAoModelo; use
    // a contagem para numerar a chamada (1, 2, 3… na requisição).
    // TODO 5: acumule tokensEntrada e tokensSaida quando `uso` existir; quando
    // não existir, conte em chamadasSemUso. Marque usoSimulado se a origem
    // for "simulado". Inclua os tokens no evento só quando forem conhecidos.
    // TODO 7: toda tentativa sem uso conhecido deve entrar em chamadasSemUso,
    // inclusive a que termina em erro, e cada tentativa conta uma vez só.
    observacao.contadores.chamadasAoModelo =
      observacao.contadores.chamadasAoModelo + 1;
    let numeroDaChamada = observacao.contadores.chamadasAoModelo;

    const inicio = agoraMonotonico();
    let mensagem: RespostaDoModelo["mensagem"];
    let uso: RespostaDoModelo["uso"];

    try {
      ({ mensagem, uso } = await chamarModelo(mensagens, ferramentas));

      if (uso) {
        observacao.contadores.tokensEntrada =
          observacao.contadores.tokensEntrada + uso.tokensEntrada;
        observacao.contadores.tokensSaida =
          observacao.contadores.tokensSaida + uso.tokensSaida;

        if (uso.origem === "simulado") {
          observacao.contadores.usoSimulado = true;
        }
      }

      emitir(observacao.registrador, {
        evento: "modelo.chamada",
        etapa: "modelo",
        requisicaoId: observacao.requisicaoId,
        conversaId: observacao.conversaId,
        numeroDaChamada,
        duracaoMs: duracaoDesde(inicio),
        tokensEntrada: uso?.tokensEntrada,
        tokensSaida: uso?.tokensSaida,
        status: "sucesso",
        origemDoUso: uso?.origem,
      });
    } catch (erro) {
      emitir(observacao.registrador, {
        evento: "modelo.chamada",
        etapa: "modelo",
        requisicaoId: observacao.requisicaoId,
        conversaId: observacao.conversaId,
        numeroDaChamada,
        duracaoMs: duracaoDesde(inicio),
        status: "falha",
        ...diagnosticarErro(erro),
      });
      throw erro;
    } finally {
      if (!uso) {
        observacao.contadores.chamadasSemUso =
          observacao.contadores.chamadasSemUso + 1;
      }
    }

    if (mensagem === undefined) {
      return { mensagens: [], fontes: [], propostas: [] };
    }
    // daqui para baixo, o código que já existia usa `mensagem`

    const novas: Mensagem[] = [mensagem];
    const fontes: FonteConsultada[] = [];
    const propostas: PropostaExibida[] = [];

    for (const chamada of mensagem.tool_calls ?? []) {
      // TODO 3: meça cada execução de ferramenta e emita um evento
      // "ferramenta.execucao" com numeroDaExecucao, ferramenta (o nome em
      // chamada.function.name), duracaoMs e status.
      // TODO 3.1: se a execução lançar erro, emita o evento com status
      // "falha" e o código seguro do erro, e relance o mesmo erro.
      // TODO 4.1: conte a execução em
      // observacao.contadores.execucoesDeFerramenta, separada das chamadas ao
      // modelo, e use a contagem para numerá-la.
      observacao.contadores.execucoesDeFerramenta =
        observacao.contadores.execucoesDeFerramenta + 1;
      let numeroDaExecucao = observacao.contadores.execucoesDeFerramenta;

      const inicioFerramenta = agoraMonotonico();

      try {
        const resultado = await executarChamada(chamada, {
          ...dependencias,
          conversaId,
        });
        emitir(observacao.registrador, {
          evento: "ferramenta.execucao",
          etapa: "ferramenta",
          requisicaoId: observacao.requisicaoId,
          conversaId: observacao.conversaId,
          duracaoMs: duracaoDesde(inicioFerramenta),
          status: "sucesso",
          ferramenta: chamada.function.name,
          numeroDaExecucao,
        });

        novas.push(resultado.mensagem);
        fontes.push(...resultado.fontes);
        propostas.push(...resultado.propostas);
      } catch (erro) {
        emitir(observacao.registrador, {
          evento: "ferramenta.execucao",
          etapa: "ferramenta",
          requisicaoId: observacao.requisicaoId,
          conversaId: observacao.conversaId,
          duracaoMs: duracaoDesde(inicioFerramenta),
          status: "falha",
          ferramenta: chamada.function.name,
          numeroDaExecucao,
          ...diagnosticarErro(erro),
        });

        throw erro;
      }
    }

    return { mensagens: novas, fontes, propostas };
  };
}
