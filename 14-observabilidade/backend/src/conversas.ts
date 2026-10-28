import type Groq from "groq-sdk";
import { randomUUID } from "node:crypto";
import type { SessaoAutenticada } from "../../../09-acoes-seguras/src/tipos.js";
import type { PropostaExibida } from "./agendamentos.js";
import {
  criarContextoDeObservacao,
  REGISTRADOR_SILENCIOSO,
  type ContextoDeObservacao,
} from "./observabilidade.js";
import {
  acrescentarMensagens,
  buscarConversa,
  emTransacao,
  inserirConversa,
  listarMensagens,
  type Banco,
} from "./banco.js";

export type Mensagem = Groq.Chat.ChatCompletionMessageParam;

/** Fonte de um trecho devolvido por consultarPoliticas. */
export type FonteConsultada = {
  fonte: string;
  secao: string;
};

/**
 * Mensagens novas de uma rodada e o que as ferramentas produziram nela:
 * fontes recuperadas e propostas preparadas.
 */
export type ResultadoRodada = {
  mensagens: Mensagem[];
  fontes: FonteConsultada[];
  propostas: PropostaExibida[];
};

/**
 * Uma rodada: recebe o histórico e devolve as mensagens novas (assistente e,
 * se houver, resultados de ferramentas). Em execução real é o processador de
 * rodada.ts com a Groq; nas verificações, uma simulação sem rede.
 */
export type ProcessadorDeRodada = (
  mensagens: readonly Mensagem[],
  contexto: { conversaId: string; observacao: ContextoDeObservacao },
) => Promise<ResultadoRodada>;

export type RespostaDaMensagem = {
  resposta: string;
  /** Fontes recuperadas durante esta mensagem, sem repetições. */
  fontesConsultadas: FonteConsultada[];
  /** Propostas preparadas durante esta mensagem, todas, na ordem. */
  propostas: PropostaExibida[];
};

function semRepeticoes(fontes: FonteConsultada[]): FonteConsultada[] {
  const vistas = new Set<string>();
  return fontes.filter(({ fonte, secao }) => {
    const chave = JSON.stringify([fonte, secao]);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/** Falha conhecida, com código e mensagem que podem ir ao navegador. */
export class ErroDeConversa extends Error {
  constructor(
    readonly codigo:
      | "CONVERSA_NAO_ENCONTRADA"
      | "CONVERSA_OCUPADA"
      | "SEM_RESPOSTA"
      | "LIMITE_DE_RODADAS",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeConversa";
  }
}

// Rodadas máximas por mensagem do usuário: uma consulta à ferramenta seguida
// da resposta cabe com folga.
const LIMITE_DE_RODADAS = 4;

/**
 * Conversas e histórico no SQLite: sobrevivem a um reinício do backend
 * enquanto o arquivo do banco for mantido.
 *
 * O protótipo tem um único usuário simulado e não implementa autenticação.
 * Cada conversa é gravada com o usuário que a criou, e só esse usuário a
 * acessa. O conversaId apenas identifica a conversa.
 *
 * A trava por conversa continua em memória: vale para um processo só.
 */
export class RepositorioDeConversas {
  private readonly emProcessamento = new Set<string>();

  constructor(
    private readonly banco: Banco,
    private readonly sessao: SessaoAutenticada,
    private readonly processarRodada: ProcessadorDeRodada,
    private readonly instrucoesSystem: string,
  ) {}

  criarConversa(): string {
    const conversaId = randomUUID();
    emTransacao(this.banco, () => {
      inserirConversa(this.banco, { id: conversaId, usuario: this.sessao.usuario });
      acrescentarMensagens(this.banco, conversaId, [
        { role: "system", content: this.instrucoesSystem },
      ]);
    });
    return conversaId;
  }

  /** Histórico gravado da conversa, para inspeção. */
  historico(conversaId: string): Mensagem[] {
    return listarMensagens(this.banco, conversaId);
  }

  private exigirConversaDoUsuario(conversaId: string): void {
    const conversa = buscarConversa(this.banco, conversaId);
    if (conversa === undefined || conversa.usuario !== this.sessao.usuario) {
      throw new ErroDeConversa(
        "CONVERSA_NAO_ENCONTRADA",
        "Conversa não encontrada.",
      );
    }
  }

  /**
   * Processa uma mensagem do usuário e devolve o texto final do assistente
   * com as fontes e propostas desta mensagem.
   *
   * - O histórico é lido do banco e enviado ao modelo a cada rodada.
   * - Nenhuma transação fica aberta durante as chamadas ao modelo: as
   *   mensagens novas são gravadas juntas, numa transação curta, só quando
   *   há resposta final. Em caso de falha, o histórico gravado não muda.
   * - Uma mensagem por vez em cada conversa (trava em memória), liberada
   *   também em caso de erro.
   */
  async enviarMensagem(
    conversaId: string,
    texto: string,
    // Criado pela rota de mensagens. Sem ele (testes, uso direto), os eventos
    // vão para um registrador que descarta tudo.
    observacao: ContextoDeObservacao = criarContextoDeObservacao(
      "sem-requisicao",
      conversaId,
      REGISTRADOR_SILENCIOSO,
    ),
  ): Promise<RespostaDaMensagem> {
    this.exigirConversaDoUsuario(conversaId);

    if (this.emProcessamento.has(conversaId)) {
      throw new ErroDeConversa(
        "CONVERSA_OCUPADA",
        "Já existe uma mensagem sendo processada nesta conversa.",
      );
    }

    this.emProcessamento.add(conversaId);
    try {
      const historico = listarMensagens(this.banco, conversaId);
      const novasDaMensagem: Mensagem[] = [{ role: "user", content: texto }];
      const fontes: FonteConsultada[] = [];
      const propostas: PropostaExibida[] = [];

      for (let rodada = 0; rodada < LIMITE_DE_RODADAS; rodada++) {
        const resultado = await this.processarRodada(
          [...historico, ...novasDaMensagem],
          { conversaId, observacao },
        );
        const novas = resultado.mensagens;
        novasDaMensagem.push(...novas);
        fontes.push(...resultado.fontes);
        propostas.push(...resultado.propostas);

        const ultima = novas.at(-1);
        if (ultima === undefined) {
          throw new ErroDeConversa("SEM_RESPOSTA", "O modelo não respondeu.");
        }

        // Resultado de ferramenta: o modelo ainda precisa responder.
        if (ultima.role === "tool") {
          continue;
        }

        if (
          ultima.role === "assistant" &&
          typeof ultima.content === "string" &&
          ultima.content.trim() !== ""
        ) {
          const resposta = ultima.content;
          emTransacao(this.banco, () =>
            acrescentarMensagens(this.banco, conversaId, novasDaMensagem),
          );
          return {
            resposta,
            fontesConsultadas: semRepeticoes(fontes),
            propostas,
          };
        }

        throw new ErroDeConversa(
          "SEM_RESPOSTA",
          "O modelo não produziu uma resposta em texto.",
        );
      }

      throw new ErroDeConversa(
        "LIMITE_DE_RODADAS",
        "O limite de rodadas foi atingido sem resposta final.",
      );
    } finally {
      this.emProcessamento.delete(conversaId);
    }
  }

  /**
   * Executa uma ação síncrona da aplicação na conversa (a confirmação pelo
   * botão) sob a mesma trava das mensagens: se uma mensagem estiver em
   * processamento, falha com CONVERSA_OCUPADA. A trava é liberada também em
   * caso de erro.
   *
   * A validação da conversa fica a cargo da própria ação. Se a ação devolver
   * um registro, ele é gravado no histórico como mensagem da aplicação, para
   * as rodadas seguintes. Não é uma chamada de ferramenta e não usa
   * tool_call_id.
   */
  executarAcaoDaAplicacao<T>(
    conversaId: string,
    acao: () => { resultado: T; registro?: string },
  ): T {
    if (this.emProcessamento.has(conversaId)) {
      throw new ErroDeConversa(
        "CONVERSA_OCUPADA",
        "Já existe uma operação em andamento nesta conversa.",
      );
    }

    this.emProcessamento.add(conversaId);
    try {
      const { resultado, registro } = acao();
      if (registro !== undefined) {
        emTransacao(this.banco, () =>
          acrescentarMensagens(this.banco, conversaId, [
            { role: "system", content: `Registro da aplicação: ${registro}` },
          ]),
        );
      }
      return resultado;
    } finally {
      this.emProcessamento.delete(conversaId);
    }
  }
}
