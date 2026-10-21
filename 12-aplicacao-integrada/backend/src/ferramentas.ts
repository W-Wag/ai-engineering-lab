import type Groq from "groq-sdk";
import { basename } from "node:path";
import {
  consultarDisponibilidade,
  eConsultaValida,
} from "../../../03-harness/src/disponibilidade.js";
import { criarFerramentas } from "../../../04-contexto/src/processar-rodada.js";
import type { FonteConsultada, Mensagem } from "./conversas.js";
import type { ResultadoPoliticas } from "./politicas.js";

export type BuscadorDePoliticas = (
  consulta: string,
) => Promise<ResultadoPoliticas>;

/** Mensagem de ferramenta para o histórico e as fontes que ela trouxe. */
export type ResultadoDaFerramenta = {
  mensagem: Mensagem;
  fontes: FonteConsultada[];
};

/**
 * consultarDisponibilidade, como no módulo 04, mais consultarPoliticas.
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
  buscarPoliticas: BuscadorDePoliticas,
): Promise<ResultadoDaFerramenta> {
  let argumentos: unknown;
  try {
    argumentos = JSON.parse(chamada.function.arguments);
  } catch {
    throw new Error("Argumentos inválidos: JSON malformado.");
  }

  const responder = (conteudo: unknown, fontes: FonteConsultada[]) => ({
    mensagem: {
      role: "tool" as const,
      tool_call_id: chamada.id,
      content: JSON.stringify(conteudo),
    },
    fontes,
  });

  switch (chamada.function.name) {
    case "consultarDisponibilidade": {
      if (!eConsultaValida(argumentos)) {
        throw new Error("Argumentos inválidos para consultarDisponibilidade.");
      }
      return responder(consultarDisponibilidade(argumentos), []);
    }

    case "consultarPoliticas": {
      if (!eConsultaPoliticasValida(argumentos)) {
        throw new Error("Argumentos inválidos para consultarPoliticas.");
      }

      const resultado = await buscarPoliticas(argumentos.consulta.trim());
      if (!resultado.encontrado) {
        return responder({ tipo: "conteudo_de_referencia", encontrado: false }, []);
      }

      // Só o nome do arquivo, nunca um caminho.
      const trecho = {
        conteudo: resultado.trecho.conteudo,
        fonte: basename(resultado.trecho.fonte),
        secao: resultado.trecho.secao,
      };

      return responder(
        { tipo: "conteudo_de_referencia", encontrado: true, trecho },
        [{ fonte: trecho.fonte, secao: trecho.secao }],
      );
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${chamada.function.name}`);
  }
}
