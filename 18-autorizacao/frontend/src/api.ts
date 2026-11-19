// Cliente HTTP. O cookie de sessão é HttpOnly: o JavaScript não o lê nem o
// envia à mão; o navegador o envia sozinho (mesma origem, via proxy do
// Vite). As escritas levam o token CSRF da sessão no cabeçalho x-csrf-token.
//
// A interface não decide permissões: ela só mostra o que o backend devolve.

export type Usuario = { id: string; nome: string; login: string }
export type ResumoDeConversa = { id: string; titulo: string; criadaEm: string }
export type Conversa = ResumoDeConversa & { proprietarioId: string }
export type Mensagem = { autor: 'usuario' | 'assistente'; texto: string; criadaEm: string }
export type Sessao = { usuario: Usuario; csrfToken: string }

export class ErroDaApi extends Error {
  readonly status: number
  readonly codigo: string

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
  }
}

async function requisitar<T>(
  metodo: string,
  caminho: string,
  opcoes: { corpo?: unknown; csrf?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opcoes.corpo !== undefined) headers['content-type'] = 'application/json'
  if (opcoes.csrf) headers['x-csrf-token'] = opcoes.csrf

  let resposta: Response
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    })
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', 'Não foi possível falar com o servidor.')
  }

  if (resposta.status === 204) return undefined as T
  const dados: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const erro = (dados as { erro?: { codigo?: string; mensagem?: string } } | null)?.erro
    throw new ErroDaApi(resposta.status, erro?.codigo ?? 'ERRO', erro?.mensagem ?? `Erro ${resposta.status}`)
  }
  return dados as T
}

export const api = {
  /** Sessão atual, ou null se não houver (401). */
  async sessaoAtual(): Promise<Sessao | null> {
    try {
      return await requisitar<Sessao>('GET', '/sessao')
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.status === 401) return null
      throw erro
    }
  },
  entrar: (login: string, senha: string) =>
    requisitar<Sessao>('POST', '/sessao', { corpo: { login, senha } }),
  sair: (csrf: string) => requisitar<void>('DELETE', '/sessao', { csrf }),

  listarConversas: () => requisitar<{ conversas: ResumoDeConversa[] }>('GET', '/conversas'),
  abrirConversa: (id: string) =>
    requisitar<{ conversa: Conversa; mensagens: Mensagem[] }>('GET', `/conversas/${encodeURIComponent(id)}`),
  criarConversa: (titulo: string, csrf: string) =>
    requisitar<{ conversa: Conversa }>('POST', '/conversas', { corpo: { titulo }, csrf }),
  enviarMensagem: (id: string, texto: string, csrf: string) =>
    requisitar<{ mensagens: Mensagem[] }>('POST', `/conversas/${encodeURIComponent(id)}/mensagens`, {
      corpo: { texto },
      csrf,
    }),
}
