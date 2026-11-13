import { useState, useSyncExternalStore } from 'react'
import App from '../App.tsx'
import { criarTransporteSimulado } from './transporteSimulado.ts'

// Página da investigação (cenário 1): o App REAL, com o transporte
// SIMULADO no lugar do cliente HTTP, mais os comandos que controlam a ordem
// dos acontecimentos da execução A.

export function CenarioExecucaoAnterior() {
  const [simulado] = useState(criarTransporteSimulado)
  useSyncExternalStore(simulado.assinar, simulado.versao)

  return (
    <>
      <App transmitir={simulado.transmitir} />
      <section className="investigacao">
        <h2>Investigação: execução anterior (transporte SIMULADO)</h2>
        <p className="aviso">
          Nenhuma requisição é feita. A notificação atrasada de A é forçada pela simulação; o
          cliente real não a produziria.
        </p>
        <div className="controles">
          <button type="button" onClick={simulado.liberarNotificacaoDeA} disabled={!simulado.aEsperaComando()}>
            Liberar notificação pendente de A
          </button>
          <button type="button" onClick={simulado.encerrarA} disabled={!simulado.aEsperaComando()}>
            Encerrar A sem nova notificação
          </button>
        </div>
        <p>
          Controlador abortado por execução:{' '}
          {simulado.execucoes().map((e) => `${e.nome}: ${e.abortada ? 'sim' : 'não'}`).join(' · ') || '—'}
        </p>
        <ol className="registros">
          {simulado.registros().map((r) => (
            <li key={r.ordem}>{r.texto}</li>
          ))}
        </ol>
        <p className="aviso">Recarregue a página para recomeçar do zero.</p>
      </section>
    </>
  )
}
