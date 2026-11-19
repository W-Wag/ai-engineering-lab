// Tipos do domínio e da identidade. Contas e dados são FICTÍCIOS, de
// demonstração local.

/** Identidade estabelecida pelo backend a partir da sessão validada. */
export type UsuarioAutenticado = {
  id: string;
  nome: string;
  login: string;
};

export type Conversa = {
  id: string;
  titulo: string;
  proprietarioId: string;
  criadaEm: string;
};

/** O que a listagem devolve de cada conversa. */
export type ResumoDeConversa = {
  id: string;
  titulo: string;
  criadaEm: string;
};

export type Autor = "usuario" | "assistente";

export type Mensagem = {
  autor: Autor;
  texto: string;
  criadaEm: string;
};

/**
 * Erro com resposta HTTP definida. A mensagem vai para o cliente, então
 * nunca deve conter dados privados nem detalhes internos.
 */
export class ErroHttp extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

/**
 * Lançado pelos TODOs ainda não implementados. A rota responde 501 sem
 * devolver dados, sem gravar e sem chamar o modelo.
 */
export class TodoPendente extends Error {
  readonly todo: string;

  constructor(todo: string) {
    super(`TODO ${todo} ainda não implementado`);
    this.todo = todo;
  }
}
