import type Groq from "groq-sdk";
import { basename } from "node:path";
import {
  consultarDisponibilidade,
  eConsultaValida,
} from "../../../03-harness/src/disponibilidade.js";
import type { SessaoAutenticada } from "../../../09-acoes-seguras/src/tipos.js";
import { criarFerramentas } from "../../../04-contexto/src/processar-rodada.js";
import {
  eArgumentosDaProposta,
  type PropostaExibida,
  type ServicoDeAgendamentos,
} from "./agendamentos.js";
import type { FonteConsultada, Mensagem } from "./conversas.js";
import type { ResultadoPoliticas } from "./politicas.js";

export type BuscadorDePoliticas = (
  consulta: string,
) => Promise<ResultadoPoliticas>;

/** Dependências e contexto disponíveis às ferramentas numa rodada. */
export type ContextoDasFerramentas = {
  buscarPoliticas: BuscadorDePoliticas;
  agendamentos: ServicoDeAgendamentos;
  sessao: SessaoAutenticada;
  conversaId: string;
};

/**
 * Mensagem de ferramenta para o histórico e o que ela produziu para a
 * interface: fontes recuperadas e propostas preparadas.
 */
export type ResultadoDaFerramenta = {
  mensagem: Mensagem;
  fontes: FonteConsultada[];
  propostas: PropostaExibida[];
};

/**
 * consultarDisponibilidade, como no módulo 04, consultarPoliticas e
 * prepararPropostaAgendamento. Não há ferramenta de confirmação nem de criação
 * direta: o agendamento só é criado pelo botão da interface.
 */
export function criarDefinicoesDeFerramentas(): Groq.Chat.ChatCompletionTool[] {
  return [
    ...criarFerramentas(),
    {
      type: "function",
      function: {
        name: "consultarPoliticas",
        description:
          "Busca, nas políticas de atendimento documentadas, o trecho mais relacionado a uma pergunta sobre regras, taxas, prazos ou condições.",
        parameters: {
          type: "object",
          properties: {
            consulta: {
              type: "string",
              minLength: 1,
              description: "Pergunta ou assunto a buscar, em texto.",
            },
          },
          required: ["consulta"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "prepararPropostaAgendamento",
        description:
          "Prepara uma proposta de agendamento para o usuário atual com um profissional, data e horário disponíveis. Não cria o agendamento: ele só é criado quando o usuário confirmar pelo botão na interface.",
        parameters: {
          type: "object",
          properties: {
            profissionalId: {
              type: "string",
              description: "Identificador do profissional",
            },
            data: { type: "string", description: "Data no formato YYYY-MM-DD" },
            horario: { type: "string", description: "Horário no formato HH:MM" },
          },
          required: ["profissionalId", "data", "horario"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function eConsultaPoliticasValida(
  valor: unknown,
): valor is { consulta: string } {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return false;
  }
  const consulta = (valor as Record<string, unknown>).consulta;
  return typeof consulta === "string" && consulta.trim() !== "";
}

/**
 * Despacha uma chamada de ferramenta pedida pelo modelo, valida os argumentos
 * e devolve o resultado como mensagem "tool" associada ao tool_call_id.
 * Ferramenta desconhecida ou argumentos inválidos lançam erro, como no
 * módulo 04.
 */
export async function executarChamada(
  chamada: Groq.Chat.ChatCompletionMessageToolCall,
  contexto: ContextoDasFerramentas,
): Promise<ResultadoDaFerramenta> {
  let argumentos: unknown;
  try {
    argumentos = JSON.parse(chamada.function.arguments);
  } catch {
    throw new Error("Argumentos inválidos: JSON malformado.");
  }

  const responder = (
    conteudo: unknown,
    produzido: { fontes?: FonteConsultada[]; propostas?: PropostaExibida[] } = {},
  ): ResultadoDaFerramenta => ({
    mensagem: {
      role: "tool",
      tool_call_id: chamada.id,
      content: JSON.stringify(conteudo),
    },
    fontes: produzido.fontes ?? [],
    propostas: produzido.propostas ?? [],
  });

  switch (chamada.function.name) {
    case "consultarDisponibilidade": {
      if (!eConsultaValida(argumentos)) {
        throw new Error("Argumentos inválidos para consultarDisponibilidade.");
      }
      return responder(consultarDisponibilidade(argumentos));
    }

    case "consultarPoliticas": {
      if (!eConsultaPoliticasValida(argumentos)) {
        throw new Error("Argumentos inválidos para consultarPoliticas.");
      }

      const resultado = await contexto.buscarPoliticas(argumentos.consulta.trim());
      if (!resultado.encontrado) {
        return responder({ tipo: "conteudo_de_referencia", encontrado: false });
      }

      // Só o nome do arquivo, nunca um caminho.
      const trecho = {
        conteudo: resultado.trecho.conteudo,
        fonte: basename(resultado.trecho.fonte),
        secao: resultado.trecho.secao,
      };

      return responder(
        { tipo: "conteudo_de_referencia", encontrado: true, trecho },
        { fontes: [{ fonte: trecho.fonte, secao: trecho.secao }] },
      );
    }

    case "prepararPropostaAgendamento": {
      if (!eArgumentosDaProposta(argumentos)) {
        throw new Error("Argumentos inválidos para prepararPropostaAgendamento.");
      }

      const resultado = contexto.agendamentos.preparar(
        contexto.sessao,
        contexto.conversaId,
        argumentos,
      );

      if (!resultado.preparada) {
        // Dados inválidos ou horário indisponível: o modelo é informado e
        // nenhuma proposta chega à interface.
        return responder({ tipo: "proposta_nao_preparada", motivo: resultado.motivo });
      }

      return responder(
        {
          tipo: "proposta_preparada",
          ...resultado.proposta,
          aviso:
            "O agendamento ainda não foi criado. Ele só é criado quando o usuário confirmar pelo botão na interface.",
        },
        { propostas: [resultado.proposta] },
      );
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${chamada.function.name}`);
  }
}
