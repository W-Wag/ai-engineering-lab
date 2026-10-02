import { lerDocumentos, Trecho } from "./documentos.js";
import { gerarResposta } from "./gerar-resposta.js";

const pergunta =
  "Se eu desistir do atendimento, com qual antecedência evito uma taxa?";

async function main(): Promise<void> {
  const documentos = await lerDocumentos();
  const usarApi = process.argv.includes("--gerar");

  // TODO: selecione trechos por palavras-chave, sem depender da posição do array.
  const palavrasIgnoradas = new Set([
    "se",
    "do",
    "com",
    "quanto",
    "de",
    "posso",
    "sem",
    "a",
    "o",
    "para",
    "tempo",
  ]);
  const trechosSelecionados: Trecho[] = [];

  const palavrasChave = pergunta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((palavra) => palavrasIgnoradas.has(palavra) === false);

  const documentoFiltrado = documentos.filter((documento) =>
    palavrasChave.some((palavra) =>
      documento.conteudo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .toLowerCase()
        .includes(palavra.toLowerCase()),
    ),
  );

  const documentosComCoincidencias = documentos.map((documento) => {
    const palavrasFiltradas = palavrasChave.filter((palavra) => {
      return documento.conteudo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .toLowerCase()
        .includes(
          palavra
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}\s]/gu, ""),
        );
    });

    const novoDocumento = {
      ...documento,
      palavrasCoincidentes: palavrasFiltradas,
    };

    return novoDocumento
  }).filter(documento => documento.palavrasCoincidentes.length > 0)

  trechosSelecionados.push(...documentosComCoincidencias);

  // TODO: preserve fonte e conteúdo ao montar o contexto textual.
  let contexto = "";
  for (const trecho of trechosSelecionados) {
    const novoContexto = `
    Fonte: ${trecho.fonte} \n \n
    Palavras que coincidiram: ${trecho.palavrasCoincidentes} \n
    ${trecho.conteudo} \n`;

    contexto += novoContexto;
  }

  console.log("Trechos disponíveis:");
  console.dir(documentos, { depth: null });
  console.log("Trechos selecionados:");
  console.dir(trechosSelecionados, { depth: null });
  console.log("Contexto montado:");
  console.log(contexto);

  if (!usarApi) {
    console.log(
      "Inspeção concluída sem chamada à API. Use --gerar para continuar.",
    );
    return;
  }

  // TODO: envie pergunta, trechos selecionados e contexto para gerarResposta.
  const resposta = await gerarResposta(pergunta, trechosSelecionados, contexto);

  // TODO: apresente a resposta retornada pelo modelo.

  console.dir(resposta, { depth: null });
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
