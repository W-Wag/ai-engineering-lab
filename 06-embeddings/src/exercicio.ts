import { lerDocumentos } from "../../05-rag/src/documentos.js";
import {
  gerarEmbeddingDocumento,
  gerarEmbeddingPergunta,
} from "./embeddings.js";
import { similaridadeCosseno } from "./similaridade.js";

type DocumentoComEmbedding = {
  fonte: string;
  conteudo: string;
  embedding: number[];
};

type DocumentoPontuado = DocumentoComEmbedding & {
  pontuacao: number;
};

const pergunta =
  "Qual é o valor da multa se eu cancelar duas horas antes do atendimento?";

async function main(): Promise<void> {
  // Cada documento curto é um único trecho: { fonte, conteudo }.
  const documentos = await lerDocumentos();

  if (documentos.length <= 0) {
    throw new Error("sem documentos para analisar.")
  }

  // TODO: percorra os documentos e obtenha o embedding de cada um,
  // preservando fonte e conteúdo original (DocumentoComEmbedding).
  const documentosComEmbedding: DocumentoComEmbedding[] = [];
  for (const documento of documentos) {
    const embedding = await gerarEmbeddingDocumento(
      documento.conteudo
    );
    const novoDocumento = { ...documento, embedding: embedding };

    documentosComEmbedding.push(novoDocumento);
  }

  // TODO: obtenha o embedding da pergunta.
  const embeddingPergunta = await gerarEmbeddingPergunta(pergunta);

  // TODO: calcule a pontuação de cada documento com similaridadeCosseno
  // (DocumentoPontuado).

  const pontuacaoDeDocumentos: DocumentoPontuado[] = [];

  for (const documento of documentosComEmbedding) {
    const pontuacao = similaridadeCosseno(
      documento.embedding,
      embeddingPergunta,
    );

    pontuacaoDeDocumentos.push({
      ...documento,
      pontuacao: pontuacao,
    });
  }

  // TODO: ordene do maior para o menor.
  pontuacaoDeDocumentos.sort((a, b) => b.pontuacao - a.pontuacao);

  // TODO: selecione o primeiro colocado.

  const primeiroColocado = pontuacaoDeDocumentos[0];

  // TODO: exiba o ranking e o trecho escolhido, com sua fonte.
  console.log("Ranking de documentos: ", pontuacaoDeDocumentos);
  console.log("Trecho selecionado: ", primeiroColocado);

  console.log(`Pergunta: ${pergunta}`);
  console.log(`Documentos lidos: ${documentos.length}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
