import { randomUUID } from "node:crypto";
import { consultarDisponibilidade } from "../../../03-harness/src/disponibilidade.js";
import { sessao as sessaoDoModulo09 } from "../../../09-acoes-seguras/src/dados.js";
import { verificarFormato } from "../../../09-acoes-seguras/src/formato.js";
import type {
  AgendamentoGravado,
  Confirmacao,
  DadosProposta,
  SessaoAutenticada,
} from "../../../09-acoes-seguras/src/tipos.js";
import { verificarSolicitacao } from "../../../09-acoes-seguras/src/verificacoes.js";
import {
  buscarAgendamento,
  buscarConversa,
  buscarOperacao,
  buscarProposta,
  emTransacao,
  eViolacaoDeUnicidade,
  horarioReservado,
  inserirAgendamento,
  inserirOperacao,
  inserirProposta,
  type Banco,
  type ChaveDaOperacao,
  type PropostaGravada,
} from "./banco.js";

/**
 * Sessão simulada do protótipo: um único usuário fictício (joao, o mesmo do
 * módulo 09). Não é autenticação real.
 */
export const SESSAO_FICTICIA: SessaoAutenticada = sessaoDoModulo09;

export const TIPO_OPERACAO = "criar-agendamento";

/** Argumentos que o modelo informa ao preparar uma proposta. */
export type ArgumentosDaProposta = {
  profissionalId: string;
  data: string;
  horario: string;
};

/** O que a interface recebe de uma proposta. */
export type PropostaExibida = {
  propostaId: string;
  profissional: string;
  data: string;
  horario: string;
  estado: "aguardando_confirmacao";
};

export type ResultadoDaPreparacao =
  | { preparada: true; proposta: PropostaExibida }
  | { preparada: false; motivo: string };

/** Agendamento devolvido pela confirmação. */
export type AgendamentoConfirmado = {
  id: number;
  profissional: string;
  data: string;
  horario: string;
};

export type ResultadoDaConfirmacao = {
  resultado: "criado" | "reutilizado";
  agendamento: AgendamentoConfirmado;
};

/** Falha conhecida da confirmação, com mensagem que pode ir ao navegador. */
export class ErroDeConfirmacao extends Error {
  constructor(
    readonly codigo:
      | "CONVERSA_NAO_ENCONTRADA"
      | "PROPOSTA_NAO_ENCONTRADA"
      | "HORARIO_INDISPONIVEL"
      | "OPERACAO_EM_CONFLITO"
      | "CONFIRMACAO_BLOQUEADA",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeConfirmacao";
  }
}

export function eArgumentosDaProposta(
  valor: unknown,
): valor is ArgumentosDaProposta {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return false;
  }
  const objeto = valor as Record<string, unknown>;
  return (
    typeof objeto.profissionalId === "string" &&
    typeof objeto.data === "string" &&
    typeof objeto.horario === "string"
  );
}

/** Formata o resultado da confirmação para a resposta HTTP. */
export function confirmado(
  resultado: ResultadoDaConfirmacao["resultado"],
  agendamento: AgendamentoGravado,
): ResultadoDaConfirmacao {
  return {
    resultado,
    agendamento: {
      id: agendamento.id,
      profissional: agendamento.profissional,
      data: agendamento.data,
      horario: agendamento.horario,
    },
  };
}

/** Chave da operação de uma proposta, com escopo de usuário e tipo. */
export function chaveDaOperacao(
  sessao: SessaoAutenticada,
  proposta: PropostaGravada,
): ChaveDaOperacao {
  return {
    usuario: sessao.usuario,
    tipoOperacao: TIPO_OPERACAO,
    chave: proposta.chaveOperacao,
  };
}

/** Verdadeiro se cliente, profissional, data e horário são iguais. */
export function mesmosDados(a: DadosProposta, b: DadosProposta): boolean {
  return (
    a.cliente === b.cliente &&
    a.profissional === b.profissional &&
    a.data === b.data &&
    a.horario === b.horario
  );
}

/**
 * Propostas, agendamentos e operações no SQLite. Sobrevivem a um reinício do
 * backend enquanto o arquivo do banco for mantido.
 */
export class ServicoDeAgendamentos {
  constructor(private readonly banco: Banco) {}

  /**
   * Horário disponível na agenda fictícia (módulo 03) e ainda sem
   * agendamento gravado no banco.
   */
  horarioDisponivel(dados: DadosProposta): boolean {
    const { horarios } = consultarDisponibilidade({
      profissionalId: dados.profissional,
      data: dados.data,
    });
    return horarios.includes(dados.horario) && !horarioReservado(this.banco, dados);
  }

  /**
   * Usada pela ferramenta prepararPropostaAgendamento. Valida os dados,
   * consulta a disponibilidade e grava a proposta. Não cria agendamento.
   * O cliente é sempre o usuário da sessão.
   */
  preparar(
    sessao: SessaoAutenticada,
    conversaId: string,
    argumentos: ArgumentosDaProposta,
  ): ResultadoDaPreparacao {
    const dados: DadosProposta = Object.freeze({
      cliente: sessao.usuario,
      profissional: argumentos.profissionalId.trim(),
      data: argumentos.data.trim(),
      horario: argumentos.horario.trim(),
    });

    const problema = verificarFormato(dados);
    if (problema !== undefined) {
      return { preparada: false, motivo: problema };
    }

    if (!this.horarioDisponivel(dados)) {
      return {
        preparada: false,
        motivo: "O horário não está disponível para o profissional e a data informados.",
      };
    }

    const id = randomUUID();
    inserirProposta(this.banco, {
      id,
      conversaId,
      usuario: sessao.usuario,
      dados,
      chaveOperacao: `proposta-${id}`,
    });

    return {
      preparada: true,
      proposta: {
        propostaId: id,
        profissional: dados.profissional,
        data: dados.data,
        horario: dados.horario,
        estado: "aguardando_confirmacao",
      },
    };
  }

  /**
   * Confirmação pelo botão. Os dados efetivos vêm da proposta gravada, nunca
   * da requisição. Deve devolver "criado" na primeira vez e "reutilizado"
   * quando a operação da proposta já foi concluída, inclusive depois de um
   * reinício do backend.
   *
   * Funções disponíveis em ./banco.ts: buscarConversa, buscarProposta,
   * buscarOperacao, buscarAgendamento, inserirAgendamento, inserirOperacao,
   * emTransacao e eViolacaoDeUnicidade. Neste arquivo: chaveDaOperacao,
   * mesmosDados, confirmado e this.horarioDisponivel.
   */
  confirmar(
    sessao: SessaoAutenticada,
    conversaId: string,
    propostaId: string,
  ): ResultadoDaConfirmacao {
    // TODO 1: recupere a conversa e confirme que ela pertence ao usuário da
    // sessão. Se não existir ou for de outro usuário, lance
    // ErroDeConfirmacao("CONVERSA_NAO_ENCONTRADA", ...).

    const conversa = buscarConversa(this.banco, conversaId)

    if (!conversa || conversa.usuario !== sessao.usuario) {
      throw new ErroDeConfirmacao("CONVERSA_NAO_ENCONTRADA", "nenhuma conversa foi encontrada")
    }

    // TODO 2: recupere a proposta e confirme que ela pertence a esta conversa
    // e a este usuário. Senão, lance ErroDeConfirmacao("PROPOSTA_NAO_ENCONTRADA", ...).

    const proposta = buscarProposta(this.banco, propostaId)

    if (!proposta || proposta.conversaId !== conversaId || proposta.usuario !== sessao.usuario) {
      throw new ErroDeConfirmacao("PROPOSTA_NAO_ENCONTRADA", "nenhuma proposta foi encontrada")
    }

    // TODO 3: consulte a operação pela chave da proposta.
    // TODO 3.1: mesma chave e mesmos dados: recupere o agendamento gravado e
    // devolva o resultado como recuperação de uma operação anterior.
    // TODO 3.2: mesma chave com dados diferentes: lance
    // ErroDeConfirmacao("OPERACAO_EM_CONFLITO", ...), sem gravar.
  
    const chave = chaveDaOperacao(sessao, proposta)

    const operacao = buscarOperacao(this.banco, chave)

    if (operacao) {
      if (mesmosDados(operacao.dados, proposta.dados) === false) {
        throw new ErroDeConfirmacao("OPERACAO_EM_CONFLITO", "os dados da proposta e operação estão conflitantes")
      }

      const agendamento = buscarAgendamento(this.banco, operacao.agendamentoId)

      if (!agendamento) {
        throw new ErroDeConfirmacao("CONFIRMACAO_BLOQUEADA", "o agendamento não existe")
      }

      return confirmado("reutilizado", agendamento)
    }


    // TODO 4: operação nova.
    // TODO 4.1: aplique os controles do módulo 09 (verificarSolicitacao) com
    // a confirmação dos dados exatos da proposta.
    // TODO 4.2: revalide a disponibilidade.
    // TODO 4.3: grave o agendamento e o registro da operação na mesma
    // transação. Pense no que acontece se o horário for reservado entre a
    // verificação e a gravação.
    // TODO 4.4: devolva o resultado como criação.

    const confirmacao = {id: crypto.randomUUID(), usuario: sessao.usuario, dados: proposta.dados}
    const motivo = verificarSolicitacao(sessao, proposta.dados, confirmacao)

    if (motivo) {
      throw new ErroDeConfirmacao("CONFIRMACAO_BLOQUEADA", motivo)
    }

    if (!this.horarioDisponivel(proposta.dados)) {
      throw new ErroDeConfirmacao("HORARIO_INDISPONIVEL", "Esse horário não esta disponivel")
    }
    let agendamento
    try {
      agendamento = emTransacao(this.banco, () => {
      const novo = inserirAgendamento(this.banco, proposta.dados)
      inserirOperacao(this.banco, {...chave, dados: proposta.dados, agendamentoId: novo.id})

      return novo
    })
    } catch (erro) {
      if (eViolacaoDeUnicidade(erro)) {
        throw new ErroDeConfirmacao("HORARIO_INDISPONIVEL", "Esse horário não esta disponivel")
      } else {
        throw erro
      }
    }


    return confirmado("criado", agendamento)
    // TODO 5: confira que criação e recuperação devolvem resultados
    // distintos ("criado" e "reutilizado") com o mesmo agendamento.

 
  }
}
