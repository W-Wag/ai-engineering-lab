import type { Briefing, CampoRevisavel, ResultadoDaRevisao } from "./tipos.js";

// Apresentação no terminal. Nada aqui decide se a proposta é aceita.

export function imprimirBriefing(rotulo: string, briefing: Briefing): void {
  console.log(`${rotulo} (versão ${briefing.versao})`);
  console.log(`  mensagemPrincipal: ${briefing.mensagemPrincipal}`);
  console.log(`  publico:           ${briefing.publico}`);
  console.log(`  chamadaParaAcao:   ${briefing.chamadaParaAcao}`);
}

export function imprimirCabecalho(permitidos: readonly CampoRevisavel[]): void {
  console.log(`Campos permitidos pela aplicação: ${permitidos.join(", ")}`);
  console.log();
}

export function imprimirProposta(id: string, descricao: string, conteudo: unknown): void {
  console.log(`--- Proposta ${id} (SIMULADA): ${descricao}`);
  console.log(`  conteúdo recebido: ${JSON.stringify(conteudo)}`);
}

export function imprimirResultado(resultado: ResultadoDaRevisao): void {
  if (resultado.status === "estrutura_invalida") {
    console.log(`  resultado: ESTRUTURA INVÁLIDA`);
    for (const motivo of resultado.motivos) console.log(`    - ${motivo}`);
  } else if (resultado.status === "fora_do_escopo") {
    console.log(`  resultado: FORA DO ESCOPO, proposta rejeitada inteira`);
    console.log(`    campos não permitidos: ${resultado.camposNaoPermitidos.join(", ")}`);
  } else {
    console.log(`  resultado: REVISÃO APLICADA (estrutura e escopo aceitos)`);
    imprimirBriefing("  nova versão", resultado.briefing);
  }
}
