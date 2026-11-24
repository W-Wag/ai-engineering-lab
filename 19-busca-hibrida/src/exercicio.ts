import { imprimirContribuicoes, imprimirRanking, imprimirRankingFinal } from "./apresentacao.js";
import {
  CONSTANTE_RRF,
  PERGUNTA,
  RANKING_LEXICAL,
  RANKING_SEMANTICO,
  validarRanking,
} from "./dados.js";
import { fundirRrf } from "./rrf.js";

// Uso (na pasta do módulo): npm start
// Rankings simulados; nenhuma busca real, API ou modelo.

validarRanking("lexical", RANKING_LEXICAL);
validarRanking("semântico", RANKING_SEMANTICO);
const antes = JSON.stringify([RANKING_LEXICAL, RANKING_SEMANTICO]);

console.log(`Pergunta (contexto): "${PERGUNTA}"\n`);
imprimirRanking("Ranking lexical", RANKING_LEXICAL);
imprimirRanking("Ranking semântico", RANKING_SEMANTICO);

const resultado = fundirRrf(RANKING_LEXICAL, RANKING_SEMANTICO, CONSTANTE_RRF);

imprimirContribuicoes(resultado, CONSTANTE_RRF);
imprimirRankingFinal(resultado);

const preservados = JSON.stringify([RANKING_LEXICAL, RANKING_SEMANTICO]) === antes;
console.log(`rankings de entrada preservados: ${preservados ? "sim" : "NÃO"}`);
