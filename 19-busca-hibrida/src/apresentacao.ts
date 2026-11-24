import { CATALOGO } from "./dados.js";
import type { Ranking, ResultadoRrf } from "./tipos.js";

// Apresentação no terminal. Nada aqui calcula o RRF: os números vêm do
// resultado da fusão. Arredondamento só para exibir.

const CASAS = 6;

function fonteDe(id: string): string {
  return CATALOGO.find((t) => t.id === id)?.fonte ?? "(desconhecida)";
}

export function imprimirRanking(titulo: string, ranking: Ranking): void {
  console.log(`${titulo} (SIMULADO)`);
  if (ranking.length === 0) console.log("  (vazio)");
  ranking.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.id}  score original ${item.score}  ${fonteDe(item.id)}`);
  });
  console.log();
}

export function imprimirContribuicoes(resultado: readonly ResultadoRrf[], constante: number): void {
  console.log(`Contribuições RRF (constante = ${constante}; score original não entra)`);
  console.log("  ID       lexical    semântica  pontuação");
  for (const r of resultado) {
    console.log(
      `  ${r.id.padEnd(8)} ${r.contribuicaoLexical.toFixed(CASAS)}   ${r.contribuicaoSemantica.toFixed(CASAS)}   ${r.pontuacao.toFixed(CASAS)}`,
    );
  }
  console.log();
}

export function imprimirRankingFinal(resultado: readonly ResultadoRrf[]): void {
  console.log("Ranking final (RRF)");
  if (resultado.length === 0) console.log("  (vazio)");
  resultado.forEach((r, i) => console.log(`  ${i + 1}. ${r.id}  ${fonteDe(r.id)}`));
  console.log();
}
