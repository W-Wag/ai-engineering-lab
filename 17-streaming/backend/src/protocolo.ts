/**
 * Contrato do streaming: NDJSON (um objeto JSON por linha, terminado em "\n").
 *
 * POST /geracoes
 *   → 200, content-type "application/x-ndjson; charset=utf-8"
 *   → cabeçalho "x-execucao" com o identificador da execução
 *
 * Sequência válida: zero ou mais eventos "delta", seguidos de exatamente UM
 * evento terminal ("concluido" ou "erro"). Depois do terminal, o servidor
 * encerra a resposta. Todos os eventos trazem o mesmo `execucao`.
 *
 * Regras:
 * - O status 200 sai antes do primeiro fragmento e não muda depois. Uma falha
 *   após o início vira um evento "erro" ou, se nem isso for possível, um
 *   fechamento sem evento terminal.
 * - Fechamento do fluxo SEM evento terminal não é sucesso.
 * - A interrupção pelo usuário não tem evento no protocolo: o cliente cancela
 *   a requisição; o servidor percebe a desconexão e cancela o produtor.
 * - O transporte pode dividir uma linha em vários pedaços, juntar várias
 *   linhas num pedaço só e cortar um caractere UTF-8 no meio. Quem lê
 *   precisa juntar os bytes antes de interpretar.
 *
 * Este arquivo é a fonte única do contrato: o frontend importa os tipos
 * daqui (import type).
 */

/** Fragmento de texto. `indice` começa em 0 e cresce de 1 em 1. */
export type EventoDelta = {
  tipo: "delta";
  execucao: string;
  indice: number;
  texto: string;
};

/** Geração encerrada normalmente. `fragmentos` = quantidade de deltas enviados. */
export type EventoConcluido = {
  tipo: "concluido";
  execucao: string;
  fragmentos: number;
};

/** Falha segura: a mensagem é genérica e não expõe detalhes internos. */
export type EventoErro = {
  tipo: "erro";
  execucao: string;
  codigo: string;
  mensagem: string;
};

export type EventoDoStream = EventoDelta | EventoConcluido | EventoErro;

export const TIPO_DE_CONTEUDO_NDJSON = "application/x-ndjson; charset=utf-8";
