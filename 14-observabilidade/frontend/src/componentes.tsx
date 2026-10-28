import type { FormEvent } from 'react'
import type {
  FonteConsultada,
  PropostaExibida,
  ResultadoDaConfirmacao,
} from './api.ts'

// Componentes só de apresentação: recebem dados e callbacks por props e não
// guardam estado nem chamam o backend.

export type MensagemExibida = {
  id: string
  autor: 'usuario' | 'assistente'
  texto: string
  /** Fontes recuperadas para esta resposta do assistente. */
  fontesConsultadas?: FonteConsultada[]
  /** Propostas preparadas para esta resposta do assistente. */
  propostas?: PropostaExibida[]
}

/**
 * Situação da confirmação de uma proposta na interface.
 * - pendente: ainda não confirmada (ou nunca tentada);
 * - enviando: aguardando o backend;
 * - erro: a tentativa falhou; nada foi marcado como sucesso;
 * - concluida: o backend confirmou e devolveu o agendamento.
 */
export type EstadoDaConfirmacao =
  | { situacao: 'pendente' }
  | { situacao: 'enviando' }
  | { situacao: 'erro'; mensagem: string }
  | { situacao: 'concluida'; confirmacao: ResultadoDaConfirmacao }

type PropsCardProposta = {
  proposta: PropostaExibida
  estado: EstadoDaConfirmacao
  /** Bloqueia o botão por motivo externo ao card (ex.: outro envio em curso). */
  desabilitado: boolean
  onConfirmar: () => void
}

/**
 * Card de uma proposta. Só apresenta: quem decide o estado é quem usa o card.
 * O sucesso exibido vem do resultado do backend (estado "concluida"), nunca
 * do texto do modelo.
 */
export function CardProposta({
  proposta,
  estado,
  desabilitado,
  onConfirmar,
}: PropsCardProposta) {
  const tituloId = `proposta-${proposta.propostaId}`
  const enviando = estado.situacao === 'enviando'
  const concluida = estado.situacao === 'concluida'

  return (
    <section className="proposta" aria-labelledby={tituloId}>
      <h2 className="proposta__titulo" id={tituloId}>
        Proposta de agendamento
      </h2>
      <dl className="proposta__dados">
        <dt>Profissional</dt>
        <dd>{proposta.profissional}</dd>
        <dt>Data</dt>
        <dd>{proposta.data}</dd>
        <dt>Horário</dt>
        <dd>{proposta.horario}</dd>
      </dl>

      {!concluida && (
        <button
          type="button"
          className="proposta__botao"
          onClick={onConfirmar}
          disabled={desabilitado || enviando}
          aria-describedby={tituloId}
        >
          {estado.situacao === 'erro' ? 'Tentar confirmar novamente' : 'Confirmar agendamento'}
        </button>
      )}

      <p className="proposta__status" role="status" aria-live="polite">
        {enviando && 'Confirmando…'}
        {concluida &&
          (estado.confirmacao.resultado === 'criado'
            ? `Agendamento criado (ID ${estado.confirmacao.agendamento.id}).`
            : `Este agendamento já tinha sido criado (ID ${estado.confirmacao.agendamento.id}).`)}
      </p>

      {estado.situacao === 'erro' && (
        <p className="proposta__erro" role="alert">
          {estado.mensagem}
        </p>
      )}
    </section>
  )
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

type PropsListaMensagens = {
  mensagens: MensagemExibida[]
  /** Estado da confirmação de cada proposta, pelo propostaId. */
  estadosDasPropostas?: Record<string, EstadoDaConfirmacao>
  /** Chamado com o propostaId quando o botão de um card é clicado. */
  onConfirmarProposta?: (propostaId: string) => void
  /** Bloqueio externo dos botões de confirmação. */
  confirmacaoDesabilitada?: boolean
}

export function ListaMensagens({ mensagens, confirmacaoDesabilitada, estadosDasPropostas, onConfirmarProposta }: PropsListaMensagens) {
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
          {/* TODO 10 (bloco 3): renderize um CardProposta para cada proposta
              desta mensagem, com os dados recebidos do backend.
              TODO 10.1: passe a cada card o estado da sua proposta (pendente
              quando ainda não houver), o bloqueio externo e um onConfirmar
              que chame onConfirmarProposta com o propostaId do card. As
              props já estão declaradas em PropsListaMensagens. */}
              {mensagem.propostas && mensagem.propostas.map((proposta) => (
                <CardProposta key={proposta.propostaId} proposta={proposta} estado={estadosDasPropostas?.[proposta.propostaId] ?? {situacao: 'pendente'}} onConfirmar={() => onConfirmarProposta && onConfirmarProposta(proposta.propostaId)} desabilitado={confirmacaoDesabilitada ? confirmacaoDesabilitada : false} />
              ))}
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
