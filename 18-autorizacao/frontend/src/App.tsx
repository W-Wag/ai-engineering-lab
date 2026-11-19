import { useEffect, useState, type FormEvent } from 'react'
import { api, ErroDaApi, type Conversa, type Mensagem, type ResumoDeConversa, type Sessao } from './api.ts'

// Interface de estudo (infraestrutura pronta). As decisões de acesso ficam
// no backend; esconder algo aqui não protegeria nada.

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroDaApi) return `${erro.message} (${erro.status} ${erro.codigo})`
  return 'Erro inesperado.'
}

export default function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [verificando, setVerificando] = useState(true)
  const [erroGeral, setErroGeral] = useState<string | null>(null)

  useEffect(() => {
    api
      .sessaoAtual()
      .then(setSessao)
      .catch((e: unknown) => setErroGeral(mensagemDeErro(e)))
      .finally(() => setVerificando(false))
  }, [])

  async function sair() {
    if (!sessao) return
    try {
      await api.sair(sessao.csrfToken)
    } catch (e) {
      setErroGeral(mensagemDeErro(e))
    }
    setSessao(null)
  }

  if (verificando) return <main className="pagina">Verificando sessão…</main>

  return (
    <main className="pagina">
      <header className="topo">
        <h1>Conversas privadas</h1>
        {sessao && (
          <div className="identidade">
            <span>
              Conectado como <strong>{sessao.usuario.nome}</strong> ({sessao.usuario.login})
            </span>
            <button type="button" onClick={() => void sair()}>
              Sair
            </button>
          </div>
        )}
      </header>
      {erroGeral && <p className="erro">{erroGeral}</p>}
      {sessao ? (
        <AreaDoUsuario key={sessao.usuario.id} sessao={sessao} aoPerderSessao={() => setSessao(null)} />
      ) : (
        <Login aoEntrar={setSessao} />
      )}
    </main>
  )
}

function Login({ aoEntrar }: { aoEntrar: (s: Sessao) => void }) {
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      aoEntrar(await api.entrar(login, senha))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="cartao login">
      <h2>Entrar</h2>
      <p className="aviso">
        Contas de <strong>demonstração local</strong>, não são contas reais:
        <br />
        <code>ana</code> / <code>ana-demo-local</code> · <code>carlos</code> / <code>carlos-demo-local</code>
      </p>
      <form onSubmit={(e) => void enviar(e)}>
        <label>
          Login
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button type="submit" disabled={enviando || !login || !senha}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      {erro && <p className="erro">{erro}</p>}
    </section>
  )
}

function AreaDoUsuario({ sessao, aoPerderSessao }: { sessao: Sessao; aoPerderSessao: () => void }) {
  const [conversas, setConversas] = useState<ResumoDeConversa[] | null>(null)
  const [erroDaLista, setErroDaLista] = useState<string | null>(null)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [erroDaCriacao, setErroDaCriacao] = useState<string | null>(null)
  const [recarregar, setRecarregar] = useState(0)

  function tratar(e: unknown, mostrar: (m: string) => void) {
    if (e instanceof ErroDaApi && e.status === 401) aoPerderSessao()
    else mostrar(mensagemDeErro(e))
  }

  useEffect(() => {
    let ativo = true
    api
      .listarConversas()
      .then((r) => ativo && (setConversas(r.conversas), setErroDaLista(null)))
      .catch((e: unknown) => ativo && tratar(e, setErroDaLista))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar])

  async function criar(evento: FormEvent) {
    evento.preventDefault()
    setErroDaCriacao(null)
    try {
      const { conversa } = await api.criarConversa(novoTitulo, sessao.csrfToken)
      setNovoTitulo('')
      setSelecionada(conversa.id)
      setRecarregar((n) => n + 1)
    } catch (e) {
      tratar(e, setErroDaCriacao)
    }
  }

  return (
    <div className="area">
      <aside className="cartao lista">
        <h2>Minhas conversas</h2>
        {erroDaLista && <p className="erro">{erroDaLista}</p>}
        {!conversas && !erroDaLista && <p>Carregando…</p>}
        {conversas?.length === 0 && <p className="aviso">Nenhuma conversa.</p>}
        <ul>
          {conversas?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === selecionada ? 'selecionada' : ''}
                onClick={() => setSelecionada(c.id)}
              >
                {c.titulo}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void criar(e)} className="criar">
          <input
            placeholder="Título da nova conversa"
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
          />
          <button type="submit" disabled={!novoTitulo.trim()}>
            Criar
          </button>
        </form>
        {erroDaCriacao && <p className="erro">{erroDaCriacao}</p>}
      </aside>
      {selecionada ? (
        <ConversaAberta key={selecionada} id={selecionada} sessao={sessao} tratar={tratar} />
      ) : (
        <section className="cartao conversa aviso">Escolha uma conversa.</section>
      )}
    </div>
  )
}

function ConversaAberta({
  id,
  sessao,
  tratar,
}: {
  id: string
  sessao: Sessao
  tratar: (e: unknown, mostrar: (m: string) => void) => void
}) {
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let ativo = true
    api
      .abrirConversa(id)
      .then((r) => ativo && (setConversa(r.conversa), setMensagens(r.mensagens)))
      .catch((e: unknown) => ativo && tratar(e, setErro))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function pedirResposta(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const r = await api.enviarMensagem(id, texto, sessao.csrfToken)
      setMensagens((anteriores) => [...anteriores, ...r.mensagens])
      setTexto('')
    } catch (e) {
      tratar(e, setErro)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="cartao conversa">
      <h2>{conversa?.titulo ?? 'Conversa'}</h2>
      {conversa && (
        <p className="aviso">
          ID: <code>{conversa.id}</code> · proprietário: <code>{conversa.proprietarioId}</code>
        </p>
      )}
      {erro && <p className="erro">{erro}</p>}
      {!conversa && !erro && <p>Carregando…</p>}
      <ol className="mensagens">
        {mensagens.map((m, i) => (
          <li key={i} className={`mensagem ${m.autor}`}>
            <span className="autor">{m.autor === 'usuario' ? 'Você' : 'Modelo simulado'}</span>
            {m.texto}
          </li>
        ))}
      </ol>
      {conversa && (
        <form onSubmit={(e) => void pedirResposta(e)} className="enviar">
          <input placeholder="Mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" disabled={enviando || !texto.trim()}>
            {enviando ? 'Aguardando…' : 'Pedir resposta simulada'}
          </button>
        </form>
      )}
    </section>
  )
}
