import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Trecho = {
  fonte: string;
  conteudo: string;
  palavrasCoincidentes?: string[]
};

export async function lerDocumentos(): Promise<Trecho[]> {
  const pasta = join(dirname(fileURLToPath(import.meta.url)), "../documentos");
  const nomes = (await readdir(pasta)).filter((nome) => nome.endsWith(".md"));

  return Promise.all(
    nomes.sort().map(async (nome) => ({
      fonte: nome,
      conteudo: await readFile(join(pasta, nome), "utf8"),
    })),
  );
}
