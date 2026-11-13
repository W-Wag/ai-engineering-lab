import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transmitirGeracao, type EventoDoCliente } from '../src/cliente.ts'

// Testes de unidade do cliente com um fetch falso (sem rede): conferem
// como o transporte é traduzido em eventos. Não testam o App.

const bytes = (texto: string) => new TextEncoder().encode(texto)
const linha = (evento: object) => `${JSON.stringify(evento)}\n`

/** fetch falso que responde com estes pedaços de texto. */
function buscarCom(pedacos: string[], status = 200): typeof fetch {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controle) {
          for (const p of pedacos) controle.enqueue(bytes(p))
          controle.close()
        },
      }),
      { status },
    )
}

async function coletar(gerador: AsyncGenerator<EventoDoCliente>) {
  const recebidos: EventoDoCliente[] = []
  for await (const e of gerador) recebidos.push(e)
  return recebidos
}

const D0 = { tipo: 'delta', execucao: 'e1', indice: 0, texto: 'Olá ' }
const FIM = { tipo: 'concluido', execucao: 'e1', fragmentos: 1 }

test('fluxo normal termina no "concluido"', async () => {
  const sinal = new AbortController().signal
  const recebidos = await coletar(transmitirGeracao(sinal, { buscar: buscarCom([linha(D0), linha(FIM)]) }))
  assert.deepEqual(recebidos, [D0, FIM])
})

test('fluxo que fecha sem evento terminal vira falha, não sucesso', async () => {
  const sinal = new AbortController().signal
  const recebidos = await coletar(transmitirGeracao(sinal, { buscar: buscarCom([linha(D0)]) }))
  assert.equal(recebidos.length, 2)
  assert.deepEqual(recebidos[0], D0)
  assert.equal(recebidos[1]!.tipo, 'falha_no_transporte')
  assert.equal((recebidos[1] as { motivo: string }).motivo, 'sem_evento_terminal')
})

test('status diferente de 200 vira falha http', async () => {
  const sinal = new AbortController().signal
  const recebidos = await coletar(transmitirGeracao(sinal, { buscar: buscarCom([], 503) }))
  assert.deepEqual(recebidos, [{ tipo: 'falha_no_transporte', motivo: 'http', detalhe: 'status 503' }])
})

test('execucao trocada no meio do fluxo vira falha de protocolo', async () => {
  const sinal = new AbortController().signal
  const outro = { ...FIM, execucao: 'e2' }
  const recebidos = await coletar(transmitirGeracao(sinal, { buscar: buscarCom([linha(D0), linha(outro)]) }))
  assert.equal(recebidos.at(-1)!.tipo, 'falha_no_transporte')
})

test('abortar o signal entrega "cancelado", distinto de falha', async () => {
  const controlador = new AbortController()
  // fetch falso que fica pendente até o abort, como o fetch real.
  const buscar: typeof fetch = (_url, init) =>
    new Promise((_, rejeitar) => {
      init!.signal!.addEventListener('abort', () => rejeitar(new DOMException('aborted', 'AbortError')))
    })
  const gerador = transmitirGeracao(controlador.signal, { buscar })
  const proximo = gerador.next()
  controlador.abort()
  assert.deepEqual((await proximo).value, { tipo: 'cancelado' })
  assert.equal((await gerador.next()).done, true)
})

test('abortar durante a leitura também entrega "cancelado"', async () => {
  const controlador = new AbortController()
  const buscar: typeof fetch = async (_url, init) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controle) {
          controle.enqueue(bytes(linha(D0)))
          init!.signal!.addEventListener('abort', () => controle.error(new DOMException('aborted', 'AbortError')))
        },
      }),
    )
  const gerador = transmitirGeracao(controlador.signal, { buscar })
  assert.deepEqual((await gerador.next()).value, D0)
  const proximo = gerador.next()
  controlador.abort()
  assert.deepEqual((await proximo).value, { tipo: 'cancelado' })
})
