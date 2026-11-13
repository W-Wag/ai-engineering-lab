import type { EventoDoCliente } from '../cliente.ts'

// TRANSPORTE SIMULADO da investigação (cenário 1: execução anterior).
//
// Substitui transmitirGeracao só na página ?cenario=execucao-anterior. A
// ordem dos acontecimentos é controlada por comandos explícitos (botões),
// sem atrasos aleatórios.
//
// O que ele faz DE PROPÓSITO e o cliente real não faria: depois de entregar
// "cancelado" para a execução A, ainda guarda uma notificação pendente de A
// e só a libera quando você manda. Isso existe para exercitar a defesa do
// App contra notificações atrasadas. Não é comportamento observado do
// transporte real.
//
// Execuções: a 1ª chamada é A, a 2ª é B; chamadas seguintes recebem C, D...
// com o mesmo comportamento de B. Recarregue a página para recomeçar.

export type Registro = { ordem: number; texto: string }

type Comando = 'liberar' | 'encerrar'

type ExecucaoSimulada = {
  nome: string
  abortada: boolean
  /** Resolve o próximo comando que a execução A está esperando. */
  comandoPendente: ((comando: Comando) => void) | null
}

export function criarTransporteSimulado() {
  const registros: Registro[] = []
  const ouvintes = new Set<() => void>()
  const execucoes: ExecucaoSimulada[] = []
  let versao = 0

  function registrar(texto: string) {
    registros.push({ ordem: registros.length + 1, texto })
    versao++
    for (const ouvinte of ouvintes) ouvinte()
  }

  function esperarAbort(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve()
    return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
  }

  function esperarComando(execucao: ExecucaoSimulada): Promise<Comando> {
    return new Promise((resolve) => {
      execucao.comandoPendente = resolve
      versao++
      for (const ouvinte of ouvintes) ouvinte()
    })
  }

  async function* execucaoA(execucao: ExecucaoSimulada, signal: AbortSignal): AsyncGenerator<EventoDoCliente> {
    let terminouSozinha = false
    try {
      yield { tipo: 'delta', execucao: 'sim-A', indice: 0, texto: 'Texto da execução A, ' }
      yield { tipo: 'delta', execucao: 'sim-A', indice: 1, texto: 'ainda em andamento.' }
      registrar('A entregou 2 fragmentos e espera o cancelamento')

      await esperarAbort(signal)
      execucao.abortada = true
      registrar('A recebeu o abort do seu controlador')
      yield { tipo: 'cancelado' }
      registrar('A entregou "cancelado"; segura uma notificação pendente')

      const comando = await esperarComando(execucao)
      execucao.comandoPendente = null
      if (comando === 'liberar') {
        registrar('A liberou a notificação pendente (delta atrasado)')
        yield { tipo: 'delta', execucao: 'sim-A', indice: 2, texto: ' [NOTIFICAÇÃO ATRASADA DE A]' }
        registrar('A: a interface pediu o próximo evento depois do atrasado')
        await esperarComando(execucao) // qualquer comando encerra a rotina
        execucao.comandoPendente = null
      }
      registrar('A encerrou a rotina sozinha (fim do fluxo, sem novo evento)')
      terminouSozinha = true
    } finally {
      execucao.comandoPendente = null
      if (!terminouSozinha) registrar('A: a interface parou de ler antes do fim (return/break no laço)')
      versao++
      for (const ouvinte of ouvintes) ouvinte()
    }
  }

  async function* execucaoComum(execucao: ExecucaoSimulada, signal: AbortSignal): AsyncGenerator<EventoDoCliente> {
    const id = `sim-${execucao.nome}`
    yield { tipo: 'delta', execucao: id, indice: 0, texto: `Texto da execução ${execucao.nome}, ` }
    yield { tipo: 'delta', execucao: id, indice: 1, texto: 'que só termina quando alguém clica em Parar.' }
    registrar(`${execucao.nome} entregou 2 fragmentos e espera o cancelamento`)
    await esperarAbort(signal)
    execucao.abortada = true
    registrar(`${execucao.nome} recebeu o abort do seu controlador`)
    yield { tipo: 'cancelado' }
  }

  /** Mesma assinatura de transmitirGeracao. */
  function transmitir(signal: AbortSignal): AsyncGenerator<EventoDoCliente> {
    const nome = String.fromCharCode(65 + execucoes.length) // A, B, C...
    const execucao: ExecucaoSimulada = { nome, abortada: false, comandoPendente: null }
    execucoes.push(execucao)
    registrar(`${nome} iniciada`)
    return nome === 'A' ? execucaoA(execucao, signal) : execucaoComum(execucao, signal)
  }

  function comandarA(comando: Comando) {
    execucoes[0]?.comandoPendente?.(comando)
  }

  return {
    transmitir,
    /** Libera a notificação pendente de A. */
    liberarNotificacaoDeA: () => comandarA('liberar'),
    /** A termina a rotina sem entregar mais nada. */
    encerrarA: () => comandarA('encerrar'),
    aEsperaComando: () => execucoes[0]?.comandoPendente != null,
    execucoes: () => execucoes.map((e) => ({ nome: e.nome, abortada: e.abortada })),
    registros: () => registros,
    versao: () => versao,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
  }
}

export type TransporteSimulado = ReturnType<typeof criarTransporteSimulado>
