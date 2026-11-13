import type { EstadoDaGeracao } from './estado.ts'

// Apresentação. Nada aqui decide estado: só mostra o que recebe.

const ROTULOS: Record<EstadoDaGeracao, string> = {
  ocioso: 'Pronto para gerar',
  aguardando: 'Aguardando o primeiro conteúdo…',
  recebendo: 'Recebendo…',
  concluido: 'Concluído',
  interrompido: 'Interrompido pelo usuário',
  erro: 'Erro',
}

type PropsDoPainel = {
  estado: EstadoDaGeracao
  texto: string
  erro: string | null
  podeGerar: boolean
  podeParar: boolean
  aoGerar: () => void
  aoParar: () => void
}

export function Painel(props: PropsDoPainel) {
  const { estado, texto, erro } = props
  return (
    <main className="painel">
      <h1>Streaming de texto</h1>
      <p className="aviso">Produtor simulado com texto fixo. Nenhum modelo é chamado.</p>

      <div className="controles">
        <button type="button" onClick={props.aoGerar} disabled={!props.podeGerar}>
          Gerar
        </button>
        <button type="button" onClick={props.aoParar} disabled={!props.podeParar}>
          Parar
        </button>
      </div>

      <p className={`estado estado-${estado}`} role="status">
        {ROTULOS[estado]}
      </p>

      <div className={`texto texto-${estado}`} aria-live="polite">
        {texto === '' && estado !== 'ocioso' ? <span className="vazio">(sem texto)</span> : texto}
      </div>

      {estado === 'interrompido' && (
        <p className="marca">Texto parcial: a geração foi interrompida antes do fim.</p>
      )}
      {estado === 'erro' && (
        <p className="erro">
          {erro ?? 'A geração falhou.'}
          {texto !== '' && ' O texto acima está incompleto.'}
        </p>
      )}
    </main>
  )
}
