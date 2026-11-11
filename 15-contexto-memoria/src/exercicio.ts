import { imprimirContexto, imprimirHistorico } from "./apresentacao.js";
import { montarContexto } from "./contexto.js";
import { ESTADO_ATUAL, HISTORICO, INSTRUCOES, MENSAGEM_ATUAL } from "./dados.js";

// Uso (na pasta do módulo): npm start -- <N>
// Exemplo: npm start -- 2
// Sem argumento, usa N = 2. Nenhuma chamada a modelo é feita.

const argumento = process.argv[2];
const n = argumento === undefined ? 2 : Number(argumento);

// Cópia do histórico antes da montagem, para conferir que nada mudou.
const antes = JSON.stringify(HISTORICO);

imprimirHistorico(HISTORICO);
const contexto = montarContexto(INSTRUCOES, ESTADO_ATUAL, HISTORICO, MENSAGEM_ATUAL, n);
imprimirContexto(contexto, n);

const preservado = JSON.stringify(HISTORICO) === antes;
console.log(`Histórico original preservado: ${preservado ? "sim" : "NÃO"}`);
