import {
  gerarEmbeddingDocumento,
  gerarEmbeddingPergunta,
} from "../../06-embeddings/src/embeddings.js";
import { similaridadeCosseno } from "../../06-embeddings/src/similaridade.js";
import type { Trecho } from "../../07-chunking/src/documento.js";

export type TrechoPontuado = Trecho & {
  pontuacao: number;
};

/**
 * Texto que representa o trecho na busca: título da seção seguido do
 * conteúdo. Usado apenas para gerar o embedding; o trecho não é alterado.
 */
export function textoParaEmbedding(trecho: Trecho): string {
  return `${trecho.secao}\n${trecho.conteudo}`;
}

/**
 * Compara a pergunta com cada trecho e devolve o ranking completo, do mais
 * para o menos similar, preservando id, fonte, secao e conteudo originais.
 *
 * Não seleciona nenhum trecho: lista vazia de trechos devolve ranking vazio,
 * e decidir o que fazer com o ranking é responsabilidade de quem chama.
 */
export async function ranquearTrechos(
  pergunta: string,
  trechos: readonly Trecho[],
): Promise<TrechoPontuado[]> {
  if (trechos.length === 0) {
    return [];
  }

  const embeddingPergunta = await gerarEmbeddingPergunta(pergunta);
  const pontuados: TrechoPontuado[] = [];

  for (const trecho of trechos) {
    const embedding = await gerarEmbeddingDocumento(textoParaEmbedding(trecho));

    pontuados.push({
      ...trecho,
      pontuacao: similaridadeCosseno(embeddingPergunta, embedding),
    });
  }

  return pontuados.sort((a, b) => b.pontuacao - a.pontuacao);
}
