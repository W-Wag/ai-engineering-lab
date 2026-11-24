import type { Ranking, ResultadoRrf } from "./tipos.js";

// EXERCÍCIO do módulo 19: Reciprocal Rank Fusion.
//
// Contrato:
// - para cada ocorrência de um trecho num ranking:
//     contribuição = 1 / (constante + posição)
//   com a posição começando em 1 (o primeiro item é a posição 1);
// - um trecho ausente de uma lista recebe 0 dessa lista;
// - as contribuições são somadas pelo ID; cada ID aparece UMA vez na saída;
// - ordem decrescente de pontuação; em empate, ID em ordem crescente por
//   comparação simples de strings (a < b), sem localeCompare;
// - nada de arredondar aqui: arredondamento só na apresentação;
// - rankings vazios são permitidos; as listas de entrada não são alteradas.

/** Contribuição de uma ocorrência na `posicao` (começando em 1). */
export function contribuicao(posicao: number, constante: number): number {
  // TODO 1: aplique a fórmula do contrato.
  return 1 / (constante + posicao)
}

/** Funde os dois rankings pelo RRF. */
export function fundirRrf(
  lexical: Ranking,
  semantico: Ranking,
  constante: number,
): ResultadoRrf[] {
  // TODO 2: percorra o ranking lexical com a posição correta e acumule a
  // contribuição de cada ID.
  // TODO 2.1: faça o mesmo com o ranking semântico.

  const acumulado = new Map<string, {lexical: number; semantico: number}>()

  lexical.forEach((item, index) => {
    const posicao = index + 1
    const atual = acumulado.get(item.id) ?? {lexical: 0, semantico: 0}
    atual.lexical += contribuicao(posicao, constante)
    acumulado.set(item.id, atual)
  })

  semantico.forEach((item, index) => {
    const posicao = index + 1
    const atual = acumulado.get(item.id) ?? {lexical: 0, semantico: 0}
    atual.semantico += contribuicao(posicao, constante)
    acumulado.set(item.id, atual)
  })

  // TODO 3: transforme o acumulado numa lista de ResultadoRrf, um item por
  // ID, com pontuacao = contribuicaoLexical + contribuicaoSemantica.

  const resultadoRrf = Array.from(acumulado, ([id, pontos]) => ({
    id,
    contribuicaoLexical: pontos.lexical,
    contribuicaoSemantica: pontos.semantico,
    pontuacao: pontos.lexical + pontos.semantico
  }))

  // TODO 4: ordene pela pontuação decrescente; em empate, pelo ID crescente.

  return resultadoRrf.sort((a,b) => {
    if (a.pontuacao !== b.pontuacao) return b.pontuacao - a.pontuacao
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
  })
}
