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

/** Fonte e seção de um trecho recuperado pelo backend nesta mensagem. */
export type FonteConsultada = {
  fonte: string
  secao: string
}

/**
 * Proposta de agendamento preparada pelo backend nesta mensagem. Ainda não é
 * um agendamento: só vira um depois da confirmação pelo botão.
 */
export type PropostaExibida = {
  propostaId: string
  profissional: string
  data: string
  horario: string
  estado: 'aguardando_confirmacao'
}

export type RespostaDaMensagem = {
  resposta: string
  /** Trechos recuperados ao processar esta mensagem; [] sem busca. */
  fontesConsultadas: FonteConsultada[]
  /** Propostas preparadas ao processar esta mensagem; [] sem proposta. */
  propostas: PropostaExibida[]
}

function eObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function eFonteConsultada(valor: unknown): valor is FonteConsultada {
  return eObjeto(valor) && typeof valor.fonte === 'string' && typeof valor.secao === 'string'
}

function ePropostaExibida(valor: unknown): valor is PropostaExibida {
  return (
    eObjeto(valor) &&
    typeof valor.propostaId === 'string' &&
    valor.propostaId !== '' &&
    typeof valor.profissional === 'string' &&
    typeof valor.data === 'string' &&
    typeof valor.horario === 'string' &&
    valor.estado === 'aguardando_confirmacao'
  )
}

function eRespostaDaMensagem(valor: unknown): valor is RespostaDaMensagem {
  if (!temTexto('resposta')(valor)) return false
  const { fontesConsultadas, propostas } = valor as Record<string, unknown>
  return (
    Array.isArray(fontesConsultadas) &&
    fontesConsultadas.every(eFonteConsultada) &&
    Array.isArray(propostas) &&
    propostas.every(ePropostaExibida)
  )
}

/**
 * POST /conversas/:conversaId/mensagens → { resposta, fontesConsultadas, propostas }.
 * Cada chamada bem-sucedida até o backend consome a API da Groq.
 * Não tenta de novo em caso de falha.
 */
export function enviarMensagem(
  conversaId: string,
  texto: string,
): Promise<ResultadoApi<RespostaDaMensagem>> {
  return postar(
    `/conversas/${encodeURIComponent(conversaId)}/mensagens`,
    { texto },
    eRespostaDaMensagem,
  );
}

/** Agendamento criado pelo backend, como devolvido pela confirmação. */
export type AgendamentoConfirmado = {
  id: number
  profissional: string
  data: string
  horario: string
}

export type ResultadoDaConfirmacao = {
  /** "criado" na primeira vez; "reutilizado" quando a proposta já tinha sido confirmada. */
  resultado: 'criado' | 'reutilizado'
  agendamento: AgendamentoConfirmado
}

function eResultadoDaConfirmacao(valor: unknown): valor is ResultadoDaConfirmacao {
  if (!eObjeto(valor)) return false
  const { resultado, agendamento } = valor
  return (
    (resultado === 'criado' || resultado === 'reutilizado') &&
    eObjeto(agendamento) &&
    typeof agendamento.id === 'number' &&
    typeof agendamento.profissional === 'string' &&
    typeof agendamento.data === 'string' &&
    typeof agendamento.horario === 'string'
  )
}

/**
 * POST /conversas/:conversaId/propostas/:propostaId/confirmar.
 * Envia só os identificadores: cliente, data e horário vêm da proposta
 * guardada no backend. Não consome a API da Groq.
 * Chamar de novo com a mesma proposta devolve o mesmo agendamento
 * ("reutilizado"). Não tenta de novo em caso de falha.
 */
export function confirmarProposta(
  conversaId: string,
  propostaId: string,
): Promise<ResultadoApi<ResultadoDaConfirmacao>> {
  return postar(
    `/conversas/${encodeURIComponent(conversaId)}/propostas/${encodeURIComponent(propostaId)}/confirmar`,
    {},
    eResultadoDaConfirmacao,
  )
}
