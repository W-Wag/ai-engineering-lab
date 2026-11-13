import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CenarioExecucaoAnterior } from './investigacao/CenarioExecucaoAnterior.tsx'

// ?cenario=execucao-anterior abre a investigação com transporte simulado.
// Sem parâmetro, o App usa o cliente HTTP real.
const cenario = new URLSearchParams(window.location.search).get('cenario')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {cenario === 'execucao-anterior' ? <CenarioExecucaoAnterior /> : <App />}
  </StrictMode>,
)
