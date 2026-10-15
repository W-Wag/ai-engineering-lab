import type {
  AgendamentoGravado,
  DadosProposta,
  SolicitacaoExecucao,
} from "../../09-acoes-seguras/src/tipos.js";

export type { AgendamentoGravado, DadosProposta };

export const TIPO_OPERACAO = "criar-agendamento";

/**
 * Solicitação do módulo 09 acrescida da chave de idempotência informada por
 * quem chama. A chave identifica a operação, não o agendamento.
 */
export type SolicitacaoIdempotente = SolicitacaoExecucao & {
  chaveIdempotencia: string;
};

/**
 * Identificação completa de uma operação: a chave informada só vale dentro do
 * usuário autenticado e do tipo de operação.
 */
export type ChaveOperacao = {
  readonly usuario: string;
  readonly tipoOperacao: typeof TIPO_OPERACAO;
  readonly valor: string;
};

/**
 * Registro de uma operação concluída: cópia dos dados aprovados e o resultado
 * entregue na primeira execução.
 */
export type RegistroOperacao = {
  readonly chave: ChaveOperacao;
  readonly dados: DadosProposta;
  readonly resultado: AgendamentoGravado;
};

export type ResultadoIdempotente =
  /** Primeira execução da chave: o agendamento foi gravado agora. */
  | { tipo: "criado"; agendamento: AgendamentoGravado }
  /** Mesma chave e mesmos dados: devolve o resultado registrado, sem gravar. */
  | { tipo: "reutilizado"; agendamento: AgendamentoGravado }
  /** Mesma chave com dados diferentes: nada é gravado nem substituído. */
  | { tipo: "conflito"; motivo: string }
  /** Barrado pelas verificações do módulo 09, antes de qualquer consulta. */
  | { tipo: "bloqueado"; motivo: string };
