import { imprimirBriefing, imprimirCabecalho, imprimirResultado } from "./apresentacao.js";
import { BRIEFING_ORIGINAL, CAMPOS_PERMITIDOS } from "./dados.js";
import {
  FATOS_AURORA,
  OBSERVACAO_SOBRE_AUSENCIA,
  PEDIDO_DO_USUARIO,
  PROPOSTA_DA_INVESTIGACAO,
} from "./dados-investigacao.js";
import { revisar } from "./revisao.js";

// Uso (na pasta do módulo): npm run investigar
// Investigação: uma proposta pode passar em estrutura e escopo e ainda
// conter uma afirmação sem fundamento. Nenhuma chamada a modelo.

// ---------- Apresentação do cenário (preparada) ----------

console.log("Fatos disponíveis sobre a Aurora:");
for (const fato of FATOS_AURORA.disponiveis) console.log(`  - ${fato}`);
console.log("Sem informação:");
for (const item of FATOS_AURORA.semInformacao) console.log(`  - ${item}`);
console.log(`  (${OBSERVACAO_SOBRE_AUSENCIA})`);
console.log();

imprimirBriefing("Briefing original", BRIEFING_ORIGINAL);
imprimirCabecalho(CAMPOS_PERMITIDOS);

console.log(`Pedido do usuário: "${PEDIDO_DO_USUARIO}"`);
console.log(`--- Proposta (ESCRITA À MÃO, não gerada por modelo)`);
console.log(`  conteúdo recebido: ${JSON.stringify(PROPOSTA_DA_INVESTIGACAO)}`);

// ---------- Sua parte ----------

// TODO 1: chame revisar com o briefing original, a proposta da investigação
// e a lista de campos permitidos.

const antes = JSON.stringify(BRIEFING_ORIGINAL)


const resultado = revisar(BRIEFING_ORIGINAL, PROPOSTA_DA_INVESTIGACAO, CAMPOS_PERMITIDOS)

// TODO 2: exiba o resultado e, quando existir, a nova versão.

imprimirResultado(resultado)

// TODO 3: confira se o briefing original foi preservado e imprima
// "briefing original preservado: sim/NÃO".

const preservado = JSON.stringify(BRIEFING_ORIGINAL) === antes;
console.log("briefing original preservado: " + (preservado ? "SIM" : "NÃO"))

// TODO 4 (sem código): depois de executar, compare manualmente a nova
// mensagem com FATOS_AURORA e responda:
// - qual resultado o código retornou?
// - o que esse resultado efetivamente comprova?
// - qual afirmação não tem fundamento nos dados disponíveis?

/* 
Fatos disponíveis sobre a Aurora:
  - Aurora é a marca de uma nova linha de cafés
  - a nova linha tem sabor de chocolate
  - o público é de adultos de 30 a 45 anos
  - a chamada atual convida a conhecer a linha na loja
Sem informação:
  - desconto: nenhuma informação sobre desconto foi fornecida
  (sem informação não é o mesmo que falso: a afirmação só não tem fundamento nos dados)

Briefing original (versão 1)
  mensagemPrincipal: A nova linha Aurora chegou com sabor de chocolate.
  publico:           adultos de 30 a 45 anos
  chamadaParaAcao:   Conheça na loja.
Campos permitidos pela aplicação: mensagemPrincipal

Pedido do usuário: "Encurte a mensagem principal, mantendo os fatos."
--- Proposta (ESCRITA À MÃO, não gerada por modelo)
  conteúdo recebido: {"mensagemPrincipal":"Conheça os cafés Aurora com 20% de desconto."}
  resultado: REVISÃO APLICADA (estrutura e escopo aceitos)
  nova versão (versão 2)
  mensagemPrincipal: Conheça os cafés Aurora com 20% de desconto.
  publico:           adultos de 30 a 45 anos
  chamadaParaAcao:   Conheça na loja.
briefing original preservado: SIM
*/
