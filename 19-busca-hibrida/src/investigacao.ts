import {
  imprimirCandidatos,
  imprimirFusao,
  imprimirPergunta,
  imprimirPresenca,
} from "./apresentacao-investigacao.js";
import { CONSTANTE_RRF, validarRanking } from "./dados.js";
import {
  CATALOGO_INVESTIGACAO,
  ID_ESPERADO,
  INSERCAO_B,
  JUSTIFICATIVA,
  LEXICAL_A,
  PERGUNTA_INVESTIGACAO,
  SEMANTICO_A,
} from "./dados-investigacao.js";
import { fundirRrf } from "./rrf.js";
import type { ResultadoRrf } from "./tipos.js";

// Investigação: existir no catálogo não significa participar da recuperação.
// Rankings simulados; nenhuma busca real, reranker, API ou modelo.
// Uso (na pasta do módulo): npm run investigar

validarRanking("lexical A", LEXICAL_A, CATALOGO_INVESTIGACAO);
validarRanking("semântico A", SEMANTICO_A, CATALOGO_INVESTIGACAO);

imprimirPergunta(PERGUNTA_INVESTIGACAO, ID_ESPERADO, JUSTIFICATIVA);

// ---------- Sua parte ----------
// Disponível: fundirRrf(lexical, semantico, CONSTANTE_RRF), as fixtures
// acima e imprimirCandidatos / imprimirFusao / imprimirPresenca.

// TODO 1: guarde uma cópia em texto das entradas originais (LEXICAL_A e
// SEMANTICO_A) para conferir no fim que nada foi alterado.
const fotoEntrada = JSON.stringify([LEXICAL_A, SEMANTICO_A]);

// TODO 2: cenário A. Mostre os candidatos, funda os rankings e mostre o
// resultado.

imprimirCandidatos("Cenario A", LEXICAL_A, SEMANTICO_A);

const resultadoA = fundirRrf(LEXICAL_A, SEMANTICO_A, CONSTANTE_RRF);

imprimirFusao(resultadoA);
imprimirPresenca(ID_ESPERADO, posicaoNoResultado(resultadoA, ID_ESPERADO));

// TODO 3: cenário B. Monte o ranking semântico com INSERCAO_B.item na
// posição INSERCAO_B.posicao (a partir de 1), SEM alterar SEMANTICO_A.
// Valide-o com validarRanking(..., CATALOGO_INVESTIGACAO).

const semanticoB = SEMANTICO_A.toSpliced(
  INSERCAO_B.posicao - 1,
  0,
  INSERCAO_B.item,
);
validarRanking("semântico B", semanticoB, CATALOGO_INVESTIGACAO);

// TODO 3.1: mostre os candidatos de B, funda e mostre o resultado.
imprimirCandidatos("Cenario B", LEXICAL_A, semanticoB);
const resultadoB = fundirRrf(LEXICAL_A, semanticoB, CONSTANTE_RRF);
imprimirFusao(resultadoB);
imprimirPresenca(ID_ESPERADO, posicaoNoResultado(resultadoB, ID_ESPERADO));

// TODO 4: escreva posicaoNoResultado: a posição do ID no ranking fundido
// (a partir de 1), ou "ausente". Compare pelo ID. Use-a com
// imprimirPresenca nos dois cenários.
function posicaoNoResultado(
  resultado: readonly ResultadoRrf[],
  id: string,
): number | "ausente" {
  const indice = resultado.findIndex((candidato) => candidato.id === id);
  if (indice === -1) return "ausente";
  return indice + 1;
}

// TODO 5: confira que LEXICAL_A e SEMANTICO_A continuam iguais à cópia do
// TODO 1 e imprima "entradas originais preservadas: sim/NÃO".
const preservados = JSON.stringify([LEXICAL_A, SEMANTICO_A]) === fotoEntrada;
console.log(`entradas originais preservadas: ${preservados ? "sim" : "NÃO"}`);
