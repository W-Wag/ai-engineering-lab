// Tipos do workflow de aprovação. Tudo local: terminal + SQLite.
//
//   pendente → aguardando_aprovacao → aprovado → concluido

export type Estado = "pendente" | "aguardando_aprovacao" | "aprovado" | "concluido";

/** Uma execução do workflow. O ID identifica a tarefa: retomar usa o mesmo ID. */
export type Execucao = {
  id: string;
  tema: string;
  estado: Estado;
  /** Preenchido quando o rascunho é gravado; null antes disso. */
  rascunhoId: string | null;
  criadaEm: string;
  atualizadaEm: string;
};

/** Rascunho apresentado para aprovação. Imutável neste exercício. */
export type Rascunho = {
  id: string;
  execucaoId: string;
  texto: string;
  criadoEm: string;
};

/** Registro da finalização local (nenhum envio externo). */
export type Finalizacao = {
  id: number;
  execucaoId: string;
  rascunhoId: string;
  resultado: string;
  finalizadaEm: string;
};

/** O que `retomar` devolve: a execução parou na espera ou terminou. */
export type ResultadoDaRetomada =
  | { situacao: "aguardando_aprovacao"; execucao: Execucao; rascunho: Rascunho }
  | { situacao: "concluido"; execucao: Execucao; finalizacao: Finalizacao };

export class ErroDoWorkflow extends Error {
  readonly codigo: "EXECUCAO_NAO_ENCONTRADA" | "APROVACAO_INVALIDA" | "ESTADO_INVALIDO";

  constructor(codigo: ErroDoWorkflow["codigo"], mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}

export class TodoPendente extends Error {
  constructor(todo: string) {
    super(`TODO ${todo} ainda não implementado`);
  }
}
