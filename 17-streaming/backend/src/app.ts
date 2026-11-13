import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Produtor } from "./produtor.js";
import { TIPO_DE_CONTEUDO_NDJSON, type EventoDoStream } from "./protocolo.js";

export type OpcoesDoApp = {
  produtor: Produtor;
  fastify?: FastifyServerOptions;
  /** Gerador do identificador de cada execução (padrão: UUID). */
  gerarExecucao?: () => string;
  /**
   * INVESTIGAÇÃO, desativada por padrão: depois desta quantidade de deltas,
   * o servidor fecha a resposta normalmente SEM enviar "concluido" nem
   * "erro". Simula uma violação do protocolo (fluxo incompleto), não uma
   * queda de rede: a resposta HTTP termina de forma regular.
   */
  encerrarSemTerminalDepoisDe?: number;
};

/**
 * POST /geracoes: transmite a geração em NDJSON (contrato em protocolo.ts).
 *
 * Encerramentos possíveis, cada um com seu log:
 * - normal: todos os deltas + "concluido";
 * - falha do produtor: deltas já enviados + "erro" (o status continua 200);
 * - desconexão prematura: o cliente fechou a conexão antes do fim; o produtor
 *   é cancelado e nada mais é escrito.
 */
export function construirApp(opcoes: OpcoesDoApp): FastifyInstance {
  const app = Fastify(opcoes.fastify);
  const gerarExecucao = opcoes.gerarExecucao ?? randomUUID;

  app.post("/geracoes", async (request, reply) => {
    const execucao = gerarExecucao();
    const log = request.log.child({ execucao });
    const controlador = new AbortController();
    const resposta = reply.raw;

    // A partir daqui a resposta é escrita à mão, pedaço por pedaço.
    reply.hijack();
    resposta.writeHead(200, {
      "content-type": TIPO_DE_CONTEUDO_NDJSON,
      "cache-control": "no-cache",
      "x-execucao": execucao,
    });
    log.info("geração iniciada");

    // "close" acontece tanto no fim normal quanto numa desconexão. Só é
    // desconexão prematura se a resposta ainda não tinha terminado.
    const aoFecharConexao = () => {
      if (!resposta.writableFinished) {
        log.warn("conexão encerrada antes do fim; cancelando o produtor");
        controlador.abort(new Error("conexão encerrada pelo cliente"));
      }
    };
    resposta.on("close", aoFecharConexao);

    const escrever = (evento: EventoDoStream) => {
      if (resposta.writableEnded || resposta.destroyed) return;
      resposta.write(`${JSON.stringify(evento)}\n`);
    };

    let indice = 0;
    try {
      for await (const texto of opcoes.produtor(controlador.signal)) {
        if (controlador.signal.aborted) break;
        escrever({ tipo: "delta", execucao, indice, texto });
        log.info({ indice, bytes: Buffer.byteLength(texto) }, "fragmento escrito");
        indice++;
        if (indice === opcoes.encerrarSemTerminalDepoisDe) {
          resposta.end();
          log.warn({ fragmentos: indice }, "encerrada SEM evento terminal (simulação de fluxo incompleto)");
          return;
        }
      }
      if (controlador.signal.aborted) {
        log.info({ fragmentos: indice }, "encerrada por desconexão do cliente");
        return;
      }
      escrever({ tipo: "concluido", execucao, fragmentos: indice });
      resposta.end();
      log.info({ fragmentos: indice }, "encerrada normalmente");
    } catch (falha) {
      if (controlador.signal.aborted) {
        log.info({ fragmentos: indice }, "encerrada por desconexão do cliente");
        return;
      }
      // Detalhe da falha só no log; o cliente recebe uma mensagem genérica.
      log.error({ err: falha, fragmentos: indice }, "encerrada por falha do produtor");
      escrever({
        tipo: "erro",
        execucao,
        codigo: "FALHA_NA_GERACAO",
        mensagem: "Não foi possível concluir a geração.",
      });
      resposta.end();
    } finally {
      resposta.off("close", aoFecharConexao);
    }
  });

  return app;
}
