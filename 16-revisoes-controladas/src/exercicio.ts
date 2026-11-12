import { imprimirBriefing, imprimirCabecalho, imprimirProposta, imprimirResultado } from "./apresentacao.js";
import { BRIEFING_ORIGINAL, CAMPOS_PERMITIDOS, PROPOSTAS } from "./dados.js";
import { revisar } from "./revisao.js";

// Uso (na pasta do módulo): npm start
// Propostas simuladas; nenhuma chamada a modelo.

const antes = JSON.stringify(BRIEFING_ORIGINAL);

imprimirBriefing("Briefing original", BRIEFING_ORIGINAL);
imprimirCabecalho(CAMPOS_PERMITIDOS);

for (const proposta of PROPOSTAS) {
  imprimirProposta(proposta.id, proposta.descricao, proposta.conteudo);
  const resultado = revisar(BRIEFING_ORIGINAL, proposta.conteudo, CAMPOS_PERMITIDOS);
  imprimirResultado(resultado);
  const preservado = JSON.stringify(BRIEFING_ORIGINAL) === antes;
  console.log(`  briefing original preservado: ${preservado ? "sim" : "NÃO"}`);
  console.log();
}
