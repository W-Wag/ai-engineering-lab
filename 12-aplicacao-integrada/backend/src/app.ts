import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
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

export type OpcoesDoApp = {
  processarRodada: ProcessadorDeRodada;
  instrucoesSystem: string;
  fastify?: FastifyServerOptions;
};

/**
 * Monta o app sem abrir porta. O processador de rodada é injetado: o servidor
 * real usa o do módulo 04 (Groq); as verificações usam uma simulação.
 */
export function construirApp(opcoes: OpcoesDoApp): FastifyInstance {
  const app = Fastify(opcoes.fastify);
  const conversas = new RepositorioDeConversas(
    opcoes.processarRodada,
    opcoes.instrucoesSystem,
  );

  // Qualquer falha não prevista vira uma resposta genérica: detalhes, stack e
  // mensagens de bibliotecas ficam só no log do servidor.
  app.setErrorHandler((falha, request, reply) => {
    if (falha instanceof ErroDeConversa) {
      return reply
        .status(STATUS_POR_CODIGO[falha.codigo])
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

      // { resposta, fontesConsultadas }: só fonte e seção dos trechos
      // recuperados nesta mensagem; [] quando não houve busca.
      return conversas.enviarMensagem(request.params.conversaId, texto.trim());
    },
  );

  return app;
}
