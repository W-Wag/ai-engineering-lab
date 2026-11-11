import type {
  BlocoDeContexto,
  ContextoMontado,
  EstadoAtual,
  Rodada,
} from "./tipos.js";

// Contexto reduzido = instruções → estado atual → últimas N rodadas
// concluídas → mensagem atual.
//
// Selecionar N rodadas é uma política simples para estudar o que se perde
// quando o contexto é reduzido. NÃO é controle de orçamento de tokens:
// quantidade de rodadas, mensagens ou caracteres não é quantidade de tokens.

/**
 * Seleciona as últimas `n` rodadas concluídas.
 *
 * Contrato:
 * - `n` precisa ser um inteiro não negativo; qualquer outro valor (negativo,
 *   fracionário, NaN, Infinity) lança RangeError;
 * - n = 0 não seleciona nenhuma rodada;
 * - n maior que a quantidade disponível seleciona todas;
 * - as rodadas selecionadas ficam em ordem cronológica;
 * - `historico` não é alterado (nem remoção, nem reordenação).
 */
export function selecionarRodadas(
  historico: readonly Rodada[],
  n: number,
): Rodada[] {
  // TODO 1: valide `n` conforme o contrato acima e lance RangeError quando
  // ele for inválido.
  // TODO 1.1: devolva as últimas `n` rodadas, em ordem cronológica, sem
  // alterar `historico`.

  if (
    typeof n === "undefined" ||
    n === Infinity ||
    Number.isNaN(n) ||
    n < 0 ||
    !Number.isInteger(n)
  ) {
    throw new RangeError("O número não segue o contrato proposto!");
  }

  const total = historico.length;
  let inicio = total - n;

  if (inicio < 0) inicio = 0;

  return historico.slice(inicio);
}

/**
 * Monta o contexto na ordem: instruções → estado atual → rodadas
 * selecionadas → mensagem atual. Informa quais rodadas entraram e quais
 * ficaram fora.
 */
export function montarContexto(
  instrucoes: string,
  estado: EstadoAtual,
  historico: readonly Rodada[],
  mensagemAtual: string,
  n: number,
): ContextoMontado {
  // TODO 2: use selecionarRodadas e monte os blocos na ordem acima. Cada
  // rodada vira duas mensagens (usuário, depois assistente) com o número da
  // rodada; a mensagem atual entra uma única vez, no final, com
  // rodada: "atual". O estado entra como bloco "estado", nunca dentro das
  // instruções.
  // TODO 2.1: preencha rodadasIncluidas e rodadasForaDoContexto com os
  // números das rodadas.

  const selecionadas = selecionarRodadas(historico, n);

  const blocos: BlocoDeContexto[] = [
    { tipo: "instrucoes", texto: instrucoes },
    { tipo: "estado", dados: estado },
  ];

  for (const rodada of selecionadas) {
    blocos.push({
      tipo: "mensagem",
      papel: "usuario",
      texto: rodada.usuario,
      rodada: rodada.numero,
    });
    blocos.push({
      tipo: "mensagem",
      papel: "assistente",
      texto: rodada.assistente,
      rodada: rodada.numero,
    });
  }

  blocos.push({
    tipo: "mensagem",
    papel: "usuario",
    texto: mensagemAtual,
    rodada: "atual",
  });

  const rodadasIncluidas = selecionadas.map(
    (selecionada) => selecionada.numero,
  );
  const rodadasForaDoContexto = historico.filter((item) =>
    !rodadasIncluidas.includes(item.numero),
  ).map(fora => fora.numero)

  return {blocos, rodadasIncluidas, rodadasForaDoContexto}
}
