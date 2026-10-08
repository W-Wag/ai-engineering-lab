import { lerDocumento } from "../../07-chunking/src/documento.js";
import { dividirPorSecoes } from "../../07-chunking/src/dividir.js";
import { gerarResposta } from "./gerar-resposta.js";
import { ranquearTrechos } from "./ranking.js";

const pergunta =
  "Se eu pagar a consulta por Pix, tenho desconto? Qual é o percentual?";

async function main(): Promise<void> {
  const usarApi = process.argv.includes("--gerar");

  const documento = await lerDocumento("manual-atendimento.md");
  const trechos = dividirPorSecoes(documento);
  const ranking = await ranquearTrechos(pergunta, trechos);

  console.log(`Pergunta: ${pergunta}`);
  console.log("Ranking completo:");
  console.dir(ranking, { depth: null });

  // TODO 1: selecione o primeiro trecho do ranking.
  // Escolher o primeiro colocado é uma simplificação didática: a posição não
  // garante que o trecho contém a resposta.
  // TODO 1.1: trate o ranking vazio, caso em que não há trecho a selecionar.

  if (ranking.length <= 0) {
    throw new Error("Nenhum trecho foi colocado no ranking")
  }
  
  const primeiroColocado = ranking[0]

  // TODO 2: monte o contexto textual com fonte, seção e conteúdo original do
  // trecho selecionado.

  const contexto = `Fonte: ${primeiroColocado.fonte}\nSeção: ${primeiroColocado.secao}\nConteúdo: ${primeiroColocado.conteudo}\n`
  // TODO 3: exiba o trecho selecionado e o contexto montado.
  console.log("Trecho Selecionado: ", primeiroColocado)
  console.log(`Contexto Montado:\n\n${contexto}` )

  if (!usarApi) {
    console.log(
      "Inspeção concluída sem chamada à API. Use --gerar para continuar.",
    );
    return;
  }

  // TODO 4: envie a pergunta e o contexto para gerarResposta.

  const resposta = await gerarResposta(pergunta, contexto)

  // TODO 5: apresente a resposta retornada pelo modelo.

  console.log(`Resposta Gerada:\n\n${resposta}`)
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
