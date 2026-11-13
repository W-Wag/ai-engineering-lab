import type { EventoDoStream } from '../../backend/src/protocolo.ts'
import { criarLeitorNdjson } from './ndjson.ts'

// Cliente HTTP do streaming. Ele só TRANSPORTA: abre a requisição, lê os
// bytes, interpreta as linhas e entrega eventos tipados. Ele NÃO decide
// estado, não acumula texto e não sabe qual execução está ativa na tela.
// Essas decisões ficam no App.

/** Falha percebida pelo cliente, fora dos eventos enviados pelo servidor. */
export type FalhaNoTransporte = {
  tipo: 'falha_no_transporte'
  motivo:
    | 'http' //               resposta com status diferente de 200
    | 'rede' //               conexão falhou ou caiu sem cancelamento local
    | 'protocolo' //          linha inválida ou execucao trocada no meio
    | 'sem_evento_terminal' // o fluxo fechou sem "concluido" nem "erro"
  detalhe: string
}

/**
 * Eventos entregues ao App:
 * - os do servidor: "delta", "concluido", "erro";
 * - "cancelado": o AbortSignal recebido foi abortado (pedido local);
 * - "falha_no_transporte": veja acima. Nunca é sucesso.
 *
 * Depois de "concluido", "erro", "cancelado" ou "falha_no_transporte", o
 * gerador termina: são os eventos finais.
 */
export type EventoDoCliente = EventoDoStream | { tipo: 'cancelado' } | FalhaNoTransporte

export type OpcoesDoCliente = {
  url?: string
  /** Para testes: substitui o fetch global. */
  buscar?: typeof fetch
}

function falha(motivo: FalhaNoTransporte['motivo'], detalhe: string): FalhaNoTransporte {
  return { tipo: 'falha_no_transporte', motivo, detalhe }
}

/**
 * Inicia uma geração e entrega os eventos na ordem em que chegam:
 *
 *   for await (const evento of transmitirGeracao(controlador.signal)) { ... }
 *
 * Abortar o `signal` encerra a requisição; o gerador entrega "cancelado" e
 * termina. Cancelar aqui fecha a conexão com o NOSSO backend; não comprova
 * que um provedor real parou de gerar.
 */
export async function* transmitirGeracao(
  signal: AbortSignal,
  opcoes: OpcoesDoCliente = {},
): AsyncGenerator<EventoDoCliente> {
  const buscar = opcoes.buscar ?? fetch
  let resposta: Response
  try {
    resposta = await buscar(opcoes.url ?? '/geracoes', { method: 'POST', signal })
  } catch (erro) {
    yield signal.aborted ? { tipo: 'cancelado' } : falha('rede', String(erro))
    return
  }

  if (resposta.status !== 200 || resposta.body === null) {
    await resposta.body?.cancel().catch(() => {})
    yield falha('http', `status ${resposta.status}`)
    return
  }

  const leitor = resposta.body.getReader()
  const ndjson = criarLeitorNdjson()
  let execucao: string | null = null

  try {
    for (;;) {
      if (signal.aborted) {
        yield { tipo: 'cancelado' }
        return
      }

      let lido: ReadableStreamReadResult<Uint8Array>
      try {
        lido = await leitor.read()
      } catch (erro) {
        yield signal.aborted ? { tipo: 'cancelado' } : falha('rede', String(erro))
        return
      }

      const linhas = lido.done ? ndjson.finalizar() : ndjson.receber(lido.value)
      for (const linha of linhas) {
        if (!linha.ok) {
          yield falha('protocolo', linha.motivo)
          return
        }
        execucao ??= linha.evento.execucao
        if (linha.evento.execucao !== execucao) {
          yield falha('protocolo', 'execucao diferente no meio do fluxo')
          return
        }
        yield linha.evento
        if (linha.evento.tipo !== 'delta') return // evento terminal
      }

      if (lido.done) {
        yield falha('sem_evento_terminal', 'o fluxo terminou sem "concluido" nem "erro"')
        return
      }
    }
  } finally {
    // Também roda se quem consome sair do for-await antes do fim.
    leitor.cancel().catch(() => {})
  }
}
