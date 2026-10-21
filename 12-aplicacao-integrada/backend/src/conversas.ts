import { randomUUID } from "node:crypto";
import type { Mensagem } from "../../../04-contexto/src/processar-rodada.js";

export type { Mensagem };

/**
 * Uma rodada: recebe o histórico e devolve as mensagens novas (assistente e,
 * se houver, resultados de ferramentas). Em execução real é o processarRodada
 * do módulo 04; nas verificações, uma simulação sem rede.
 */
export type ProcessadorDeRodada = (
  mensagens: readonly Mensagem[],
) => Promise<Mensagem[]>;

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
 * Conversas em memória, separadas por id. Somem ao reiniciar o backend.
 *
 * O protótipo tem um único usuário fictício e não implementa autenticação.
 * O conversaId apenas identifica a conversa; em produção ele não seria
 * suficiente para autorizar o acesso a ela.
 */
export class RepositorioDeConversas {
  private readonly historicos = new Map<string, Mensagem[]>();
  private readonly emProcessamento = new Set<string>();

  constructor(
    private readonly processarRodada: ProcessadorDeRodada,
    private readonly instrucoesSystem: string,
  ) {}

  criarConversa(): string {
    const conversaId = randomUUID();
    this.historicos.set(conversaId, [
      { role: "system", content: this.instrucoesSystem },
    ]);
    return conversaId;
  }

  existe(conversaId: string): boolean {
    return this.historicos.has(conversaId);
  }

  /** Cópia do histórico, para inspeção. */
  historico(conversaId: string): Mensagem[] {
    return [...(this.historicos.get(conversaId) ?? [])];
  }

  /**
   * Processa uma mensagem do usuário e devolve o texto final do assistente.
   *
   * - Uma mensagem por vez em cada conversa: outra chamada para a mesma
   *   conversa, enquanto esta estiver em andamento, falha com
   *   CONVERSA_OCUPADA. A trava é liberada também em caso de erro.
   * - O histórico só é atualizado quando há resposta final. Em caso de falha,
   *   a conversa continua como estava antes da mensagem.
   */
  async enviarMensagem(conversaId: string, texto: string): Promise<string> {
    const historico = this.historicos.get(conversaId);
    if (historico === undefined) {
      throw new ErroDeConversa(
        "CONVERSA_NAO_ENCONTRADA",
        "Conversa não encontrada.",
      );
    }

    if (this.emProcessamento.has(conversaId)) {
      throw new ErroDeConversa(
        "CONVERSA_OCUPADA",
        "Já existe uma mensagem sendo processada nesta conversa.",
      );
    }

    this.emProcessamento.add(conversaId);
    try {
      const trabalho: Mensagem[] = [
        ...historico,
        { role: "user", content: texto },
      ];

      for (let rodada = 0; rodada < LIMITE_DE_RODADAS; rodada++) {
        const novas = await this.processarRodada(trabalho);
        trabalho.push(...novas);

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
          this.historicos.set(conversaId, trabalho);
          return ultima.content;
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
}
