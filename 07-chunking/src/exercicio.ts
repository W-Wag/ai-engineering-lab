import { lerDocumento, type Trecho } from "./documento.js";

// Formato esperado: um título "# " que identifica o documento, seguido de
// seções "## " curtas, sem títulos aninhados nem blocos de código.

async function main(): Promise<void> {
  const documento = await lerDocumento("manual-atendimento.md");
  const trechos: Trecho[] = [];

  // TODO: identifique as seções iniciadas por títulos "## ".
  // O título "# Manual de atendimento" identifica o documento e não deve
  // virar um trecho isolado.

  const conteudoSeparado = documento.conteudo.split("\n");

  // TODO: reúna o conteúdo de cada seção até o início da próxima,
  // mantendo regra e exceção no mesmo trecho.
  // TODO: associe a cada trecho a fonte, o nome da seção e um id distinto
  // e reproduzível (o mesmo documento deve gerar os mesmos ids).
  // TODO: não gere trecho vazio.

  let sessaoAtual: string = "";
  let linhasAcumuladas: string[] = [];

  for (const linha of conteudoSeparado) {
    if (linha.startsWith("## ")) {
      const texto = linhasAcumuladas.join(" ").trim();
      if (sessaoAtual.length > 0 && texto.length > 0) {
        trechos.push({
          secao: sessaoAtual,
          conteudo: texto,
          fonte: documento.fonte,
          id: documento.fonte + "-" + sessaoAtual,
        });
      }

      sessaoAtual = linha.replace("##", "").trim();
      linhasAcumuladas = [];
    } else {
      if (sessaoAtual.length > 0) {
        linhasAcumuladas.push(linha);
      }
    }
  }

  const texto = linhasAcumuladas.join(" ").trim();

  if (sessaoAtual.length > 0 && texto.length > 0) {
    trechos.push({
      secao: sessaoAtual,
      conteudo: texto,
      fonte: documento.fonte,
      id: documento.fonte + "-" + sessaoAtual,
    });
  }

  // TODO: exiba os trechos produzidos.

  console.log("Trechos: ", trechos)
  console.log(`Fonte: ${documento.fonte}`);
  console.log(`Trechos produzidos: ${trechos.length}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
