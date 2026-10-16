import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Conteúdo externo: texto de referência, sem autoridade para pedir ações. */
export type DocumentoExterno = {
  fonte: string;
  conteudo: string;
};

/**
 * Lê um arquivo da pasta documentos/ e devolve o nome do arquivo como fonte e
 * o texto completo, sem remover nem alterar nenhum trecho.
 */
export async function lerDocumento(nome: string): Promise<DocumentoExterno> {
  const pasta = join(dirname(fileURLToPath(import.meta.url)), "../documentos");

  return {
    fonte: nome,
    conteudo: await readFile(join(pasta, nome), "utf8"),
  };
}
