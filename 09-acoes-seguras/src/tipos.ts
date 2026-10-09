/** Quem está autenticado. Neste exercício, é um dado confiável da aplicação. */
export type SessaoAutenticada = {
  readonly usuario: string;
};

/** Dados concretos de um agendamento. */
export type DadosProposta = {
  readonly cliente: string;
  readonly profissional: string;
  /** Formato AAAA-MM-DD. */
  readonly data: string;
  /** Formato HH:MM. */
  readonly horario: string;
};

/**
 * Registro, controlado pela aplicação, de que um usuário aprovou uma proposta
 * com exatamente estes dados. Não vem da solicitação e não pode ser alterado
 * por ela.
 */
export type Confirmacao = {
  readonly id: string;
  /** Usuário que confirmou. */
  readonly usuario: string;
  /** Dados exatos que foram aprovados. */
  readonly dados: DadosProposta;
};

/**
 * Pedido para executar o agendamento. É a entrada não confiável: seus campos
 * dizem o que se quer gravar, não o que foi autorizado ou confirmado.
 */
export type SolicitacaoExecucao = {
  cliente: string;
  profissional: string;
  data: string;
  horario: string;
};

export type AgendamentoGravado = DadosProposta & {
  readonly id: number;
};

export type ResultadoExecucao =
  | { executado: true; agendamento: AgendamentoGravado }
  | { executado: false; motivo: string };
