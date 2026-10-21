import type { FormEvent } from 'react'
import type { FonteConsultada } from './api.ts'

// Componentes só de apresentação: recebem dados e callbacks por props e não
// guardam estado nem chamam o backend.

export type MensagemExibida = {
  id: string
  autor: 'usuario' | 'assistente'
  texto: string
  /** Fontes recuperadas para esta resposta do assistente. */
  fontesConsultadas?: FonteConsultada[]
}

/**
 * Fontes recuperadas pelo backend ao processar uma mensagem. Mostra o que foi
 * consultado; não garante que cada afirmação da resposta esteja sustentada
 * por essas fontes. Os arquivos não existem no navegador: só texto, sem links.
 */
export function FontesConsultadas({ fontes }: { fontes: FonteConsultada[] }) {
  return (
    <section className="fontes" aria-label="Fontes consultadas">
      <h2 className="fontes__titulo">Fontes consultadas</h2>
      <ul className="fontes__lista">
        {fontes.map(({ fonte, secao }) => (
          <li key={`${fonte}\u0000${secao}`}>
            {fonte} — seção {secao}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ListaMensagens({ mensagens }: { mensagens: MensagemExibida[] }) {
  return (
    <ol className="mensagens" role="log" aria-live="polite" aria-label="Mensagens">
      {mensagens.length === 0 && (
        <li className="mensagens__vazio">Nenhuma mensagem ainda.</li>
      )}
      {mensagens.map((mensagem) => (
        <li key={mensagem.id} className={`mensagem mensagem--${mensagem.autor}`}>
          <span className="mensagem__autor">
            {mensagem.autor === 'usuario' ? 'Você' : 'Assistente'}
          </span>
          <p className="mensagem__texto">{mensagem.texto}</p>
          {/* TODO 8: passe ao componente FontesConsultadas as fontes desta
              mensagem (não de outra resposta).
              TODO 8.1: exiba a área somente quando a lista existir e não
              estiver vazia. */}
              {mensagem.fontesConsultadas && mensagem.fontesConsultadas.length > 0 && (
                <FontesConsultadas fontes={mensagem.fontesConsultadas} />
              )}
        </li>
      ))}
    </ol>
  )
}

export function IndicadorCarregamento({ visivel }: { visivel: boolean }) {
  return (
    <p className="carregando" role="status" aria-live="polite">
      {visivel ? 'Aguardando resposta…' : ''}
    </p>
  )
}

export function AreaErro({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null
  return (
    <p className="erro" role="alert">
      {mensagem}
    </p>
  )
}

type PropsFormulario = {
  texto: string
  onTextoChange: (texto: string) => void
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void
  desabilitado: boolean
}

/** Campo e botão. Enter no campo envia o formulário, como o botão. */
export function FormularioMensagem({
  texto,
  onTextoChange,
  onSubmit,
  desabilitado,
}: PropsFormulario) {
  return (
    <form className="formulario" onSubmit={onSubmit}>
      <label className="formulario__rotulo" htmlFor="campo-mensagem">
        Mensagem
      </label>
      <input
        id="campo-mensagem"
        className="formulario__campo"
        type="text"
        autoComplete="off"
        value={texto}
        onChange={(evento) => onTextoChange(evento.target.value)}
        disabled={desabilitado}
        placeholder="Pergunte sobre horários disponíveis"
      />
      <button className="formulario__botao" type="submit" disabled={desabilitado}>
        Enviar
      </button>
    </form>
  )
}
