import type { SolicitacaoExecucao } from "./tipos.js";

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORARIO = /^\d{2}:\d{2}$/;

/**
 * Validação básica de formato da solicitação. Devolve a descrição do primeiro
 * problema encontrado ou undefined quando o formato está correto.
 *
 * Verifica apenas a forma dos campos: textos não vazios, data AAAA-MM-DD e
 * horário HH:MM. Não diz nada sobre quem pode agendar nem sobre o que foi
 * confirmado.
 */
export function verificarFormato(
  solicitacao: SolicitacaoExecucao,
): string | undefined {
  if (solicitacao.cliente.trim() === "") {
    return "O cliente não foi informado.";
  }

  if (solicitacao.profissional.trim() === "") {
    return "O profissional não foi informado.";
  }

  if (!FORMATO_DATA.test(solicitacao.data)) {
    return "A data deve estar no formato AAAA-MM-DD.";
  }

  if (!FORMATO_HORARIO.test(solicitacao.horario)) {
    return "O horário deve estar no formato HH:MM.";
  }

  return undefined;
}
