import { lerDocumento } from "./documento.js";
import { dividirPorSecoes } from "./dividir.js";

async function main(): Promise<void> {
  const documento = await lerDocumento("manual-atendimento.md");

  // A divisão implementada neste exercício está em dividir.ts, para ser
  // reutilizada pelo módulo 08 sem executar este arquivo.
  const trechos = dividirPorSecoes(documento);

  // TODO: exiba os trechos produzidos.

  console.log("Trechos: ", trechos)
  console.log(`Fonte: ${documento.fonte}`);
  console.log(`Trechos produzidos: ${trechos.length}`);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
