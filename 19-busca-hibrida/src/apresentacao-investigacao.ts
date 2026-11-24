import { CATALOGO_INVESTIGACAO } from "./dados-investigacao.js";
import type { Ranking, ResultadoRrf } from "./tipos.js";

// Apresentação da investigação. Nada aqui calcula o RRF nem decide presença:
// só mostra o que recebe.

function fonteDe(id: string): string {
  return CATALOGO_INVESTIGACAO.find((t) => t.id === id)?.fonte ?? "(fora do catálogo)";
}

export function imprimirPergunta(pergunta: string, idEsperado: string, justificativa: string): void {
  const trecho = CATALOGO_INVESTIGACAO.find((t) => t.id === idEsperado);
  console.log(`Pergunta: "${pergunta}"`);
  console.log(`Trecho esperado (escolhido À MÃO na fixture): ${idEsperado} — ${trecho?.fonte}`);
  console.log(`  "${trecho?.conteudo}"`);
  console.log(`  Justificativa: ${justificativa}`);
  console.log(`  Catálogo: ${CATALOGO_INVESTIGACAO.map((t) => t.id).join(", ")}`);
  console.log();
}

export function imprimirCandidatos(titulo: string, lexical: Ranking, semantico: Ranking): void {
  console.log(`=== ${titulo}`);
  for (const [nome, ranking] of [["lexical", lexical], ["semântico", semantico]] as const) {
    const itens = ranking.map((item, i) => `${i + 1}. ${item.id} (${item.score})`).join("  ");
    console.log(`  candidatos ${nome.padEnd(9)} (SIMULADO): ${itens || "(vazio)"}`);
  }
}

export function imprimirFusao(resultado: readonly ResultadoRrf[]): void {
  console.log("  ranking fundido (RRF):");
  resultado.forEach((r, i) =>
    console.log(
      `    ${i + 1}. ${r.id.padEnd(7)} lexical ${r.contribuicaoLexical.toFixed(6)}  semântica ${r.contribuicaoSemantica.toFixed(6)}  total ${r.pontuacao.toFixed(6)}  ${fonteDe(r.id)}`,
    ),
  );
}

/** `posicao` é o que o seu código calculou: um número a partir de 1, ou "ausente". */
export function imprimirPresenca(idEsperado: string, posicao: number | "ausente"): void {
  console.log(`  ${idEsperado} no ranking fundido: ${posicao === "ausente" ? "ausente" : `posição ${posicao}`}`);
  console.log();
}
