import type { Trecho } from "../../../07-chunking/src/documento.js";
import { lerDocumento } from "../../../07-chunking/src/documento.js";
import { dividirPorSecoes } from "../../../07-chunking/src/dividir.js";
import {
  ranquearTrechos,
  type TrechoPontuado,
} from "../../../08-rag-integrado/src/ranking.js";

// Fonte única: o manual fictício do módulo 07 (Cancelamento, Duração e
// Funcionamento). A política do módulo 05 não é lida.

/** O que a ferramenta devolve ao modelo sobre o trecho selecionado. */
export type TrechoDePolitica = {
  conteudo: string;
  fonte: string;
  secao: string;
};

export type ResultadoPoliticas =
  | { encontrado: true; trecho: TrechoDePolitica }
  | { encontrado: false };

let trechos: Promise<Trecho[]> | undefined;

function carregarTrechos(): Promise<Trecho[]> {
  // Lido e dividido uma vez; os embeddings são gerados a cada consulta.
  trechos ??= lerDocumento("manual-atendimento.md").then(dividirPorSecoes);
  return trechos;
}

/**
 * Pronto: ranking completo dos trechos do manual para a consulta, do mais
 * para o menos similar, com id, fonte, secao, conteudo e pontuacao. Usa os
 * embeddings locais do módulo 06; não chama a Groq. Não seleciona trecho.
 */
export async function ranquearPoliticas(
  consulta: string,
): Promise<TrechoPontuado[]> {
  return ranquearTrechos(consulta, await carregarTrechos());
}

/**
 * Busca usada pela ferramenta consultarPoliticas.
 */
export async function buscarPoliticas(
  consulta: string,
): Promise<ResultadoPoliticas> {
  const ranking = await ranquearPoliticas(consulta);

  // TODO 5: selecione o primeiro trecho do ranking.
  // Escolher o primeiro colocado é uma simplificação didática: a posição não
  // garante que o trecho contém informação suficiente para responder.
  // TODO 5.1: trate o ranking vazio, devolvendo { encontrado: false }.

  if (ranking.length <= 0) {
    return {encontrado: false}
  }

  const trechoSelecionado: TrechoDePolitica = {
    fonte: ranking[0].fonte,
    conteudo: ranking[0].conteudo,
    secao: ranking[0].secao
  }

  // TODO 6: devolva { encontrado: true, trecho } com conteúdo, fonte e seção
  // do trecho selecionado. Substitua o erro abaixo.
  return {encontrado: true, trecho: trechoSelecionado}
}
