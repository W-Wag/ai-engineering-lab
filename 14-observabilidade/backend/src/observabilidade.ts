import type Groq from "groq-sdk";
import { performance } from "node:perf_hooks";

// Logs estruturados correlacionados de uma rodada de conversa: cada evento é
// uma linha JSON no logger do Fastify, com campos explícitos e pequenos. Não é
// tracing distribuído: não há spans, propagação entre serviços nem coletor.
//
// Nunca entram nos eventos: chaves, cabeçalhos, mensagens, argumentos das
// ferramentas, conteúdo de documentos nem o objeto de erro do SDK.

// ---------------------------------------------------------------------------
// Tempo

/**
 * Relógio monotônico, em milissegundos, para medir duração. Não volta para
 * trás se o relógio do sistema for ajustado. O valor absoluto não tem
 * significado: só a diferença entre duas leituras.
 */
export function agoraMonotonico(): number {
  return performance.now();
}

/** Duração em ms desde uma leitura de agoraMonotonico, com 1 casa decimal. */
export function duracaoDesde(inicio: number): number {
  return Math.round((performance.now() - inicio) * 10) / 10;
}

/** Data e hora de calendário (ISO), para localizar o evento no tempo. */
export function instante(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Consumo

/**
 * Tokens de uma chamada ao modelo. `origem` diz de onde vieram os números:
 * "groq" quando o provedor informou `usage`; "simulado" para valores
 * fictícios de testes e simulações.
 */
export type UsoDaChamada = {
  tokensEntrada: number;
  tokensSaida: number;
  origem: "groq" | "simulado";
};

/**
 * Lê `usage` da resposta da Groq (groq-sdk 1.6: `prompt_tokens` e
 * `completion_tokens`). Devolve undefined quando o provedor não informou:
 * uso ausente não é consumo zero.
 */
export function extrairUso(
  resposta: Pick<Groq.Chat.ChatCompletion, "usage">,
): UsoDaChamada | undefined {
  const uso = resposta.usage;
  if (
    uso === undefined ||
    typeof uso.prompt_tokens !== "number" ||
    typeof uso.completion_tokens !== "number"
  ) {
    return undefined;
  }
  return {
    tokensEntrada: uso.prompt_tokens,
    tokensSaida: uso.completion_tokens,
    origem: "groq",
  };
}

// ---------------------------------------------------------------------------
// Erros

/** Campos seguros de diagnóstico de um erro, sem mensagem nem objeto bruto. */
export type DiagnosticoDeErro = {
  /** Código da aplicação (ex.: SEM_RESPOSTA) ou, na falta, o nome do erro. */
  codigoErro: string;
  /** Status HTTP informado pelo SDK ou pela aplicação, quando houver. */
  statusErro?: number;
};

/**
 * Traduz um erro em campos seguros para o log. Usa só `codigo` (erros da
 * aplicação), `name` e `status` (erros do SDK). Não lê a mensagem: ela pode
 * conter trechos da requisição ou da resposta.
 */
export function diagnosticarErro(erro: unknown): DiagnosticoDeErro {
  if (typeof erro !== "object" || erro === null) {
    return { codigoErro: "ErroDesconhecido" };
  }
  const { codigo, name, status } = erro as {
    codigo?: unknown;
    name?: unknown;
    status?: unknown;
  };
  const codigoErro =
    typeof codigo === "string"
      ? codigo
      : typeof name === "string" && name !== ""
        ? name
        : "ErroDesconhecido";
  return typeof status === "number"
    ? { codigoErro, statusErro: status }
    : { codigoErro };
}

// ---------------------------------------------------------------------------
// Eventos

export type Status = "sucesso" | "falha";

/** Campos que todo evento de uma rodada carrega. */
type Correlacao = {
  requisicaoId: string;
  conversaId: string;
};

export type EventoChamadaAoModelo = Correlacao & {
  evento: "modelo.chamada";
  etapa: "modelo";
  /** 1, 2, 3… dentro da requisição. */
  numeroDaChamada: number;
  duracaoMs: number;
  status: Status;
  /** Presentes só quando o uso é conhecido. */
  tokensEntrada?: number;
  tokensSaida?: number;
  origemDoUso?: UsoDaChamada["origem"];
} & Partial<DiagnosticoDeErro>;

export type EventoExecucaoDeFerramenta = Correlacao & {
  evento: "ferramenta.execucao";
  etapa: "ferramenta";
  /** 1, 2, 3… dentro da requisição, independente das chamadas ao modelo. */
  numeroDaExecucao: number;
  /** Nome da ferramenta pedida pelo modelo. Nunca os argumentos. */
  ferramenta: string;
  duracaoMs: number;
  status: Status;
} & Partial<DiagnosticoDeErro>;

export type EventoResumoDaRodada = Correlacao & {
  evento: "rodada.resumo";
  etapa: "rodada";
  status: Status;
  /** Ver início e fim em app.ts, na rota de mensagens. */
  duracaoMs: number;
  chamadasAoModelo: number;
  execucoesDeFerramenta: number;
  /** Soma das chamadas com uso conhecido. */
  tokensEntrada: number;
  tokensSaida: number;
  /** Chamadas cujo uso não foi informado: o consumo real é maior ou igual. */
  chamadasSemUso: number;
  /** true se algum uso somado for fictício. */
  usoSimulado: boolean;
} & Partial<DiagnosticoDeErro>;

export type EventoObservado =
  | EventoChamadaAoModelo
  | EventoExecucaoDeFerramenta
  | EventoResumoDaRodada;

/** O mínimo de um logger (o do Fastify atende). */
export type Registrador = {
  info(objeto: object, mensagem?: string): void;
  warn(objeto: object, mensagem?: string): void;
};

/**
 * Emite um evento como uma linha estruturada. Falhas viram nível warn.
 * Acrescenta só o instante de calendário; o resto vem pronto no evento.
 */
export function emitir(registrador: Registrador, evento: EventoObservado): void {
  const linha = { ...evento, instante: instante() };
  if (evento.status === "falha") {
    registrador.warn(linha, evento.evento);
  } else {
    registrador.info(linha, evento.evento);
  }
}

// ---------------------------------------------------------------------------
// Contexto de uma rodada

/**
 * Contadores de uma requisição de mensagem. Começam em zero e são
 * atualizados durante o ciclo modelo/ferramentas.
 */
export type Contadores = {
  chamadasAoModelo: number;
  execucoesDeFerramenta: number;
  tokensEntrada: number;
  tokensSaida: number;
  chamadasSemUso: number;
  usoSimulado: boolean;
};

export function novosContadores(): Contadores {
  return {
    chamadasAoModelo: 0,
    execucoesDeFerramenta: 0,
    tokensEntrada: 0,
    tokensSaida: 0,
    chamadasSemUso: 0,
    usoSimulado: false,
  };
}

/**
 * Tudo o que o ciclo modelo/ferramentas precisa para observar uma requisição:
 * identificação, onde registrar e os contadores dela. Um por requisição.
 */
export type ContextoDeObservacao = Correlacao & {
  registrador: Registrador;
  contadores: Contadores;
};

export function criarContextoDeObservacao(
  requisicaoId: string,
  conversaId: string,
  registrador: Registrador,
): ContextoDeObservacao {
  return { requisicaoId, conversaId, registrador, contadores: novosContadores() };
}

/** Registrador que descarta tudo, para quando não há observação. */
export const REGISTRADOR_SILENCIOSO: Registrador = {
  info() {},
  warn() {},
};
