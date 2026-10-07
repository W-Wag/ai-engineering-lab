import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Documento = {
  fonte: string;
  conteudo: string;
};

export type Trecho = {
  id: string;
  fonte: string;
  secao: string;
  conteudo: string;
};

/**
 * Lê um arquivo da pasta documentos/ e devolve o nome do arquivo como fonte
 * e o texto completo, sem alterações, como conteúdo.
 */
export async function lerDocumento(nome: string): Promise<Documento> {
  const pasta = join(dirname(fileURLToPath(import.meta.url)), "../documentos");

  return {
    fonte: nome,
    conteudo: await readFile(join(pasta, nome), "utf8"),
  };
}
