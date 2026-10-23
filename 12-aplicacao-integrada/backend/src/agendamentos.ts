import { randomUUID } from "node:crypto";
import { consultarDisponibilidade } from "../../../03-harness/src/disponibilidade.js";
import { sessao as sessaoDoModulo09 } from "../../../09-acoes-seguras/src/dados.js";
import { verificarFormato } from "../../../09-acoes-seguras/src/formato.js";
import { gravarAgendamento } from "../../../09-acoes-seguras/src/gravacao.js";
import type {
  AgendamentoGravado,
  Confirmacao,
  DadosProposta,
  SessaoAutenticada,
} from "../../../09-acoes-seguras/src/tipos.js";
import { verificarSolicitacao } from "../../../09-acoes-seguras/src/verificacoes.js";
import {
  consultarOperacao,
  montarChaveOperacao,
  registrarOperacao,
} from "../../../10-idempotencia/src/armazenamento.js";

/**
 * Sessão simulada do protótipo: um único usuário fictício (joao, o mesmo do
 * módulo 09). Não é autenticação real.
 */
export const SESSAO_FICTICIA: SessaoAutenticada = sessaoDoModulo09;

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
      | "PROPOSTA_NAO_ENCONTRADA"
      | "HORARIO_INDISPONIVEL"
      | "CONFIRMACAO_BLOQUEADA",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeConfirmacao";
  }
}

type Proposta = {
  readonly propostaId: string;
  readonly conversaId: string;
  readonly usuario: string;
  /** Cópia congelada dos dados propostos. */
  readonly dados: DadosProposta;
  /** Uma chave de operação por proposta, criada junto com ela. */
  readonly chaveIdempotencia: string;
};

function eArgumentosDaProposta(valor: unknown): valor is ArgumentosDaProposta {
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

export { eArgumentosDaProposta };

function exibir(proposta: Proposta): PropostaExibida {
  return {
    propostaId: proposta.propostaId,
    profissional: proposta.dados.profissional,
    data: proposta.dados.data,
    horario: proposta.dados.horario,
    estado: "aguardando_confirmacao",
  };
}

function confirmado(
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

/**
 * Propostas e reservas em memória. Somem ao reiniciar o backend.
 *
 * A gravação é a do módulo 09, e o registro de operações, o do módulo 10.
 * Todos os métodos são síncronos: entre a verificação final de disponibilidade
 * e a gravação não há await, então duas confirmações no mesmo processo não se
 * intercalam. Isso não protege vários processos nem persiste nada.
 */
export class ServicoDeAgendamentos {
  private readonly propostas = new Map<string, Proposta>();
  /** Horários já reservados neste processo: "profissional|data|horario". */
  private readonly ocupados = new Set<string>();

  private horarioLivre(dados: DadosProposta): boolean {
    const { horarios } = consultarDisponibilidade({
      profissionalId: dados.profissional,
      data: dados.data,
    });
    const chave = [dados.profissional, dados.data, dados.horario].join("|");
    return horarios.includes(dados.horario) && !this.ocupados.has(chave);
  }

  /**
   * Usada pela ferramenta prepararPropostaAgendamento. Valida os dados,
   * consulta a disponibilidade e guarda a proposta. Não cria agendamento.
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

    if (!this.horarioLivre(dados)) {
      return {
        preparada: false,
        motivo: "O horário não está disponível para o profissional e a data informados.",
      };
    }

    const propostaId = randomUUID();
    const proposta: Proposta = Object.freeze({
      propostaId,
      conversaId,
      usuario: sessao.usuario,
      dados,
      chaveIdempotencia: `proposta-${propostaId}`,
    });
    this.propostas.set(propostaId, proposta);

    return { preparada: true, proposta: exibir(proposta) };
  }

  /**
   * Confirmação pelo botão. Usa só os dados guardados na proposta.
   *
   * 1. A proposta precisa existir e pertencer ao usuário e à conversa.
   * 2. A confirmação dos dados exatos é registrada e passa pelos controles
   *    do módulo 09.
   * 3. Se a chave da proposta já foi concluída (módulo 10), devolve o mesmo
   *    agendamento, sem gravar.
   * 4. Senão, revalida a disponibilidade, grava, reserva o horário e
   *    registra a operação.
   */
  confirmar(
    sessao: SessaoAutenticada,
    conversaId: string,
    propostaId: string,
  ): ResultadoDaConfirmacao {
    const proposta = this.propostas.get(propostaId);
    if (
      proposta === undefined ||
      proposta.conversaId !== conversaId ||
      proposta.usuario !== sessao.usuario
    ) {
      throw new ErroDeConfirmacao(
        "PROPOSTA_NAO_ENCONTRADA",
        "Proposta não encontrada nesta conversa.",
      );
    }

    const confirmacao: Confirmacao = Object.freeze({
      id: `confirmacao-${propostaId}`,
      usuario: sessao.usuario,
      dados: proposta.dados,
    });

    const motivo = verificarSolicitacao(sessao, { ...proposta.dados }, confirmacao);
    if (motivo !== undefined) {
      throw new ErroDeConfirmacao("CONFIRMACAO_BLOQUEADA", motivo);
    }

    const chave = montarChaveOperacao(sessao, proposta.chaveIdempotencia);
    const registro = consultarOperacao(chave);
    if (registro !== undefined) {
      return confirmado("reutilizado", registro.resultado);
    }

    if (!this.horarioLivre(confirmacao.dados)) {
      throw new ErroDeConfirmacao(
        "HORARIO_INDISPONIVEL",
        "O horário desta proposta não está mais disponível.",
      );
    }

    const agendamento = gravarAgendamento(confirmacao.dados);
    this.ocupados.add(
      [agendamento.profissional, agendamento.data, agendamento.horario].join("|"),
    );
    registrarOperacao(chave, confirmacao.dados, agendamento);

    return confirmado("criado", agendamento);
  }
}
