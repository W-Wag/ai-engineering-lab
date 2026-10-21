// Cliente HTTP do backend. Usa caminhos relativos: em desenvolvimento, o
// proxy do Vite repassa /conversas ao backend. Nenhuma credencial passa por
// aqui.

/** Resultado de uma chamada: dados em caso de sucesso, ou um erro exibível. */
export type ResultadoApi<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: ErroApi };

export type ErroApi = {
  /** Código vindo do backend, ou FALHA_DE_REDE / RESPOSTA_INVALIDA. */
  codigo: string;
  /** Texto que pode ser mostrado ao usuário. */
  mensagem: string;
  /** Status HTTP, quando houve resposta do servidor. */
  status?: number;
};

async function postar<T>(
  url: string,
  corpo: unknown,
  eValido: (valor: unknown) => valor is T,
): Promise<ResultadoApi<T>> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    // Sem resposta não dá para saber se o backend processou o pedido.
    return {
      ok: false,
      erro: {
        codigo: 'FALHA_DE_REDE',
        mensagem: 'Não foi possível falar com o servidor.',
      },
    };
  }

  let json: unknown;
  try {
    json = await resposta.json();
  } catch {
    json = undefined;
  }

  if (!resposta.ok) {
    const erro = (json as { erro?: { codigo?: unknown; mensagem?: unknown } })
      ?.erro;
    return {
      ok: false,
      erro: {
        codigo: typeof erro?.codigo === 'string' ? erro.codigo : 'ERRO_HTTP',
        mensagem:
          typeof erro?.mensagem === 'string'
            ? erro.mensagem
            : `O servidor respondeu com erro (${resposta.status}).`,
        status: resposta.status,
      },
    };
  }

  if (!eValido(json)) {
    return {
      ok: false,
      erro: {
        codigo: 'RESPOSTA_INVALIDA',
        mensagem: 'O servidor respondeu em um formato inesperado.',
        status: resposta.status,
      },
    };
  }

  return { ok: true, dados: json };
}

function temTexto<K extends string>(chave: K) {
  return (valor: unknown): valor is Record<K, string> =>
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as Record<string, unknown>)[chave] === 'string' &&
    (valor as Record<string, string>)[chave] !== '';
}

/** POST /conversas → { conversaId }. Não consome a API da Groq. */
export function criarConversa(): Promise<ResultadoApi<{ conversaId: string }>> {
  return postar('/conversas', {}, temTexto('conversaId'));
}

/**
 * POST /conversas/:conversaId/mensagens → { resposta }.
 * Cada chamada bem-sucedida até o backend consome a API da Groq.
 * Não tenta de novo em caso de falha.
 */
export function enviarMensagem(
  conversaId: string,
  texto: string,
): Promise<ResultadoApi<{ resposta: string }>> {
  return postar(
    `/conversas/${encodeURIComponent(conversaId)}/mensagens`,
    { texto },
    temTexto('resposta'),
  );
}
