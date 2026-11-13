import type { EventoDoStream } from '../../backend/src/protocolo.ts'

// Leitura do protocolo NDJSON (contrato em backend/src/protocolo.ts).
//
// O transporte entrega BYTES em pedaços arbitrários: uma linha pode vir
// dividida em vários pedaços, vários eventos podem vir no mesmo pedaço e um
// caractere UTF-8 de 2 a 4 bytes pode ser cortado no meio. Por isso os bytes
// passam por um TextDecoder em modo stream e o texto fica acumulado até
// aparecer o "\n" que fecha a linha.

export type LinhaInterpretada =
  | { ok: true; evento: EventoDoStream }
  | { ok: false; motivo: string }

function ehTexto(valor: unknown): valor is string {
  return typeof valor === 'string'
}

function ehInteiroNaoNegativo(valor: unknown): valor is number {
  return Number.isInteger(valor) && (valor as number) >= 0
}

/** Interpreta uma linha completa e confere o formato do evento. */
export function interpretarLinha(linha: string): LinhaInterpretada {
  let dado: unknown
  try {
    dado = JSON.parse(linha)
  } catch {
    return { ok: false, motivo: 'linha não é JSON' }
  }
  if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) {
    return { ok: false, motivo: 'evento não é um objeto' }
  }
  const e = dado as Record<string, unknown>
  if (!ehTexto(e.execucao) || e.execucao === '') {
    return { ok: false, motivo: 'evento sem execucao' }
  }
  if (e.tipo === 'delta' && ehInteiroNaoNegativo(e.indice) && ehTexto(e.texto)) {
    return { ok: true, evento: { tipo: 'delta', execucao: e.execucao, indice: e.indice, texto: e.texto } }
  }
  if (e.tipo === 'concluido' && ehInteiroNaoNegativo(e.fragmentos)) {
    return { ok: true, evento: { tipo: 'concluido', execucao: e.execucao, fragmentos: e.fragmentos } }
  }
  if (e.tipo === 'erro' && ehTexto(e.codigo) && ehTexto(e.mensagem)) {
    return { ok: true, evento: { tipo: 'erro', execucao: e.execucao, codigo: e.codigo, mensagem: e.mensagem } }
  }
  return { ok: false, motivo: `evento com formato inválido: ${String(e.tipo)}` }
}

/** Leitor incremental: recebe pedaços de bytes e devolve as linhas completas. */
export function criarLeitorNdjson() {
  const decodificador = new TextDecoder('utf-8', { fatal: true })
  let pendente = ''

  function separarLinhas(): LinhaInterpretada[] {
    const partes = pendente.split('\n')
    pendente = partes.pop() ?? ''
    return partes.filter((linha) => linha.trim() !== '').map(interpretarLinha)
  }

  return {
    receber(bytes: Uint8Array): LinhaInterpretada[] {
      try {
        pendente += decodificador.decode(bytes, { stream: true })
      } catch {
        return [{ ok: false, motivo: 'bytes inválidos em UTF-8' }]
      }
      return separarLinhas()
    },

    /** Chamado quando o fluxo acaba: sobra sem "\n" é linha incompleta. */
    finalizar(): LinhaInterpretada[] {
      try {
        pendente += decodificador.decode()
      } catch {
        return [{ ok: false, motivo: 'caractere UTF-8 incompleto no fim do fluxo' }]
      }
      const linhas = separarLinhas()
      if (pendente.trim() !== '') linhas.push({ ok: false, motivo: 'linha incompleta no fim do fluxo' })
      pendente = ''
      return linhas
    },
  }
}
