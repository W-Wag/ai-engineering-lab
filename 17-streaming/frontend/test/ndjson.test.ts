import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criarLeitorNdjson, type LinhaInterpretada } from '../src/ndjson.ts'

// Testes de unidade do parser NDJSON, sem rede: os pedaços de bytes são
// montados à mão para imitar o que o transporte pode fazer.

const bytes = (texto: string) => new TextEncoder().encode(texto)
const linha = (evento: object) => `${JSON.stringify(evento)}\n`
const eventos = (linhas: LinhaInterpretada[]) =>
  linhas.map((l) => (l.ok ? l.evento : { falha: l.motivo }))

const D0 = { tipo: 'delta', execucao: 'e1', indice: 0, texto: 'Olá ' }
const D1 = { tipo: 'delta', execucao: 'e1', indice: 1, texto: 'mundo' }
const FIM = { tipo: 'concluido', execucao: 'e1', fragmentos: 2 }

test('um evento dividido em vários pedaços só sai quando a linha fecha', () => {
  const leitor = criarLeitorNdjson()
  const texto = linha(D0)
  assert.deepEqual(leitor.receber(bytes(texto.slice(0, 10))), [])
  assert.deepEqual(leitor.receber(bytes(texto.slice(10, 25))), [])
  assert.deepEqual(eventos(leitor.receber(bytes(texto.slice(25)))), [D0])
})

test('vários eventos no mesmo pedaço saem todos, em ordem', () => {
  const leitor = criarLeitorNdjson()
  assert.deepEqual(eventos(leitor.receber(bytes(linha(D0) + linha(D1) + linha(FIM)))), [D0, D1, FIM])
})

test('fim de um evento e começo do próximo no mesmo pedaço', () => {
  const leitor = criarLeitorNdjson()
  const texto = linha(D0) + linha(D1)
  const corte = linha(D0).length + 5
  assert.deepEqual(eventos(leitor.receber(bytes(texto.slice(0, corte)))), [D0])
  assert.deepEqual(eventos(leitor.receber(bytes(texto.slice(corte)))), [D1])
})

test('caractere UTF-8 de 4 bytes cortado entre dois pedaços', () => {
  const leitor = criarLeitorNdjson()
  const evento = { tipo: 'delta', execucao: 'e1', indice: 0, texto: 'chocolate 🍫 e café ☕' }
  const todos = bytes(linha(evento))
  const posicaoDoEmoji = todos.indexOf(0xf0) // primeiro byte de 🍫
  assert.ok(posicaoDoEmoji > 0)
  assert.deepEqual(leitor.receber(todos.slice(0, posicaoDoEmoji + 2)), [])
  assert.deepEqual(eventos(leitor.receber(todos.slice(posicaoDoEmoji + 2))), [evento])
})

test('um byte por vez também funciona', () => {
  const leitor = criarLeitorNdjson()
  const todos = bytes(linha({ ...D0, texto: 'ação ☕' }) + linha(FIM))
  const saida: LinhaInterpretada[] = []
  for (const b of todos) saida.push(...leitor.receber(Uint8Array.of(b)))
  assert.deepEqual(eventos(saida), [{ ...D0, texto: 'ação ☕' }, FIM])
})

test('linha sem "\\n" no fim do fluxo é linha incompleta', () => {
  const leitor = criarLeitorNdjson()
  assert.deepEqual(leitor.receber(bytes(linha(D0) + '{"tipo":"del')).length, 1)
  assert.deepEqual(eventos(leitor.finalizar()), [{ falha: 'linha incompleta no fim do fluxo' }])
})

test('linhas inválidas viram falha de protocolo', () => {
  const leitor = criarLeitorNdjson()
  const saida = leitor.receber(
    bytes('não é json\n' + linha({ tipo: 'delta', execucao: 'e1' }) + linha({ tipo: 'outro', execucao: 'e1' })),
  )
  assert.deepEqual(eventos(saida), [
    { falha: 'linha não é JSON' },
    { falha: 'evento com formato inválido: delta' },
    { falha: 'evento com formato inválido: outro' },
  ])
})
