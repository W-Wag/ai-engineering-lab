import type { SessaoAutenticada } from "../../09-acoes-seguras/src/tipos.js";
import {
  TIPO_OPERACAO,
  type AgendamentoGravado,
  type ChaveOperacao,
  type DadosProposta,
  type RegistroOperacao,
} from "./tipos.js";

// Operações concluídas, em memória. O índice é texto montado a partir das três
// partes da chave; não há hash nem persistência.
const operacoes = new Map<string, RegistroOperacao>();

function indice(chave: ChaveOperacao): string {
  return JSON.stringify([chave.usuario, chave.tipoOperacao, chave.valor]);
}

/**
 * Monta a identificação da operação a partir do usuário autenticado e da chave
 * informada. O usuário vem da sessão, não da solicitação.
 */
export function montarChaveOperacao(
  sessao: SessaoAutenticada,
  valor: string,
): ChaveOperacao {
  return Object.freeze({
    usuario: sessao.usuario,
    tipoOperacao: TIPO_OPERACAO,
    valor,
  });
}

/** Devolve o registro da operação ou undefined se a chave nunca foi concluída. */
export function consultarOperacao(
  chave: ChaveOperacao,
): RegistroOperacao | undefined {
  return operacoes.get(indice(chave));
}

/**
 * Registra uma operação concluída, guardando cópias congeladas da chave, dos
 * dados e do resultado. Alterar depois os objetos recebidos não altera o
 * registro.
 *
 * Não substitui registros: lança erro se a chave já tiver sido registrada.
 */
export function registrarOperacao(
  chave: ChaveOperacao,
  dados: DadosProposta,
  resultado: AgendamentoGravado,
): RegistroOperacao {
  const i = indice(chave);

  if (operacoes.has(i)) {
    throw new Error(`A operação ${i} já foi registrada.`);
  }

  const registro: RegistroOperacao = Object.freeze({
    chave: Object.freeze({ ...chave }),
    dados: Object.freeze({
      cliente: dados.cliente,
      profissional: dados.profissional,
      data: dados.data,
      horario: dados.horario,
    }),
    resultado: Object.freeze({ ...resultado }),
  });

  operacoes.set(i, registro);

  return registro;
}

/** Quantidade de operações registradas. */
export function contarOperacoes(): number {
  return operacoes.size;
}
