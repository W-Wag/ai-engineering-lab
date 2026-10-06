import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// Conversão ONNX de intfloat/multilingual-e5-small, executada localmente.
export const MODELO_EMBEDDINGS = "Xenova/multilingual-e5-small";
export const DIMENSOES_EMBEDDING = 384;

// O E5 foi treinado com estes prefixos; em busca de perguntas em documentos,
// a pergunta usa "query: " e o documento usa "passage: ".
const PREFIXO_PERGUNTA = "query: ";
const PREFIXO_DOCUMENTO = "passage: ";

let extrator: Promise<FeatureExtractionPipeline> | undefined;

function carregarExtrator(): Promise<FeatureExtractionPipeline> {
  // q8 seleciona onnx/model_quantized.onnx (~118 MB), baixado na primeira execução.
  extrator ??= pipeline("feature-extraction", MODELO_EMBEDDINGS, {
    dtype: "q8",
  });

  return extrator;
}

async function gerarEmbedding(textoComPrefixo: string): Promise<number[]> {
  const extrair = await carregarExtrator();
  const saida = await extrair(textoComPrefixo, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(saida.data as Float32Array);
}

function exigirTexto(texto: string, nome: string): void {
  if (texto.trim() === "") {
    throw new Error(`${nome} não pode ser um texto vazio.`);
  }
}

/**
 * Embedding de uma pergunta de busca. Recebe a pergunta original, sem
 * prefixo, e devolve um vetor normalizado de DIMENSOES_EMBEDDING posições.
 */
export async function gerarEmbeddingPergunta(
  pergunta: string,
): Promise<number[]> {
  exigirTexto(pergunta, "A pergunta");

  return gerarEmbedding(PREFIXO_PERGUNTA + pergunta);
}

/**
 * Embedding de um documento a ser pesquisado. Recebe o conteúdo original
 * completo, sem prefixo, e devolve um vetor normalizado de
 * DIMENSOES_EMBEDDING posições. Textos acima de 512 tokens são truncados
 * pelo modelo.
 */
export async function gerarEmbeddingDocumento(
  conteudo: string,
): Promise<number[]> {
  exigirTexto(conteudo, "O conteúdo do documento");

  return gerarEmbedding(PREFIXO_DOCUMENTO + conteudo);
}
