import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { SessaoAutenticada } from "../../../09-acoes-seguras/src/tipos.js";
import {
  ErroDeConfirmacao,
  SESSAO_FICTICIA,
  ServicoDeAgendamentos,
} from "./agendamentos.js";
import type { Banco } from "./banco.js";
import {
  ErroDeConversa,
  RepositorioDeConversas,
  type ProcessadorDeRodada,
} from "./conversas.js";

/** Formato de todo erro devolvido ao navegador. */
export type RespostaDeErro = {
  erro: { codigo: string; mensagem: string };
};

const STATUS_POR_CODIGO: Record<ErroDeConversa["codigo"], number> = {
  CONVERSA_NAO_ENCONTRADA: 404,
  CONVERSA_OCUPADA: 409,
  SEM_RESPOSTA: 502,
  LIMITE_DE_RODADAS: 502,
};

function erro(codigo: string, mensagem: string): RespostaDeErro {
  return { erro: { codigo, mensagem } };
}

const STATUS_DA_CONFIRMACAO: Record<ErroDeConfirmacao["codigo"], number> = {
  CONVERSA_NAO_ENCONTRADA: 404,
  PROPOSTA_NAO_ENCONTRADA: 404,
  OPERACAO_EM_CONFLITO: 409,
  HORARIO_INDISPONIVEL: 409,
  CONFIRMACAO_BLOQUEADA: 403,
};

export type OpcoesDoApp = {
  processarRodada: ProcessadorDeRodada;
  instrucoesSystem: string;
  /** Conexão SQLite com conversas, histórico, propostas e agendamentos. */
  banco: Banco;
  /** O mesmo serviço usado pela ferramenta de propostas do processador. */
  agendamentos?: ServicoDeAgendamentos;
  /** Sessão simulada; não é autenticação real. */
  sessao?: SessaoAutenticada;
  /**
   * Investigação do módulo 13: quando true, uma confirmação que cria o
   * agendamento termina com HTTP 500 depois das gravações. Desligado por
   * padrão.
   */
  falharAposCriar?: boolean;
  fastify?: FastifyServerOptions;
};

/**
 * Monta o app sem abrir porta. O processador de rodada é injetado: o servidor
 * real usa o do módulo 04 (Groq); as verificações usam uma simulação.
 */
export function construirApp(opcoes: OpcoesDoApp): FastifyInstance {
  const app = Fastify(opcoes.fastify);
  const sessao = opcoes.sessao ?? SESSAO_FICTICIA;
  const conversas = new RepositorioDeConversas(
    opcoes.banco,
    sessao,
    opcoes.processarRodada,
    opcoes.instrucoesSystem,
  );
  const agendamentos =
    opcoes.agendamentos ?? new ServicoDeAgendamentos(opcoes.banco);

  // Qualquer falha não prevista vira uma resposta genérica: detalhes, stack e
  // mensagens de bibliotecas ficam só no log do servidor.
  app.setErrorHandler((falha, request, reply) => {
    if (falha instanceof ErroDeConversa) {
      return reply
        .status(STATUS_POR_CODIGO[falha.codigo])
        .send(erro(falha.codigo, falha.message));
    }

    if (falha instanceof ErroDeConfirmacao) {
      return reply
        .status(STATUS_DA_CONFIRMACAO[falha.codigo])
        .send(erro(falha.codigo, falha.message));
    }

    request.log.error(falha);

    const status = (falha as { statusCode?: unknown }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send(erro("REQUISICAO_INVALIDA", "A requisição não pôde ser lida."));
    }

    return reply
      .status(500)
      .send(erro("ERRO_INTERNO", "Não foi possível processar a mensagem."));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(erro("ROTA_NAO_ENCONTRADA", "Rota não encontrada.")),
  );

  app.post("/conversas", async (_request, reply) => {
    return reply.status(201).send({ conversaId: conversas.criarConversa() });
  });

  app.post<{ Params: { conversaId: string }; Body: unknown }>(
    "/conversas/:conversaId/mensagens",
    async (request, reply) => {
      const corpo = request.body as { texto?: unknown } | null | undefined;
      const texto = corpo?.texto;

      if (typeof texto !== "string" || texto.trim() === "") {
        return reply
          .status(400)
          .send(erro("TEXTO_INVALIDO", "Informe um texto não vazio."));
      }

      // { resposta, fontesConsultadas, propostas }: só o que foi recuperado
      // e preparado nesta mensagem; listas vazias quando nada ocorreu.
      return conversas.enviarMensagem(request.params.conversaId, texto.trim());
    },
  );

  // Confirmação pelo botão. O corpo é ignorado: cliente, data e horário vêm
  // da proposta guardada no backend, nunca da requisição. Não chama a Groq.
  app.post<{ Params: { conversaId: string; propostaId: string } }>(
    "/conversas/:conversaId/propostas/:propostaId/confirmar",
    async (request) => {
      const { conversaId, propostaId } = request.params;

      const confirmacao = conversas.executarAcaoDaAplicacao(conversaId, () => {
        const resultado = agendamentos.confirmar(sessao, conversaId, propostaId);
        const { id, profissional, data, horario } = resultado.agendamento;
        return {
          resultado,
          registro:
            resultado.resultado === "criado"
              ? `o usuário confirmou pelo botão a proposta ${propostaId}, e o agendamento ${id} foi criado (${profissional}, ${data}, ${horario}).`
              : undefined,
        };
      });

      // Investigação do módulo 13: falha simulada depois das gravações.
      // Neste ponto o agendamento, a operação e o registro no histórico já
      // foram gravados (commit). O erro substitui a resposta de sucesso por um
      // HTTP 500: simula a ausência da resposta de sucesso, não uma queda real
      // de rede. Só atua em criações, e só quando habilitado na montagem do
      // app (nunca pela requisição).
      if (opcoes.falharAposCriar === true && confirmacao.resultado === "criado") {
        throw new Error(
          `Falha simulada após o commit: agendamento ${confirmacao.agendamento.id} gravado, resposta de sucesso não enviada.`,
        );
      }

      return confirmacao;
    },
  );

  return app;
}
