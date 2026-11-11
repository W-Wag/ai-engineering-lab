// Tipos do exercício. Não imitam o contrato de nenhum SDK: servem para
// inspecionar o contexto no terminal. Nenhuma chamada a modelo é feita.

/**
 * Uma rodada concluída: a mensagem do usuário e a resposta do assistente.
 * Selecionar rodadas inteiras evita cortar uma troca pela metade.
 *
 * Numa conversa com ferramentas, a unidade seria maior: a resposta com
 * tool_calls e os resultados de cada ferramenta precisam ficar juntos, ou o
 * histórico enviado ao modelo fica inválido. Este exercício não usa
 * ferramentas.
 */
export type Rodada = {
  /** 1, 2, 3… na ordem em que aconteceu. */
  numero: number;
  usuario: string;
  assistente: string;
};

/**
 * Estado atual fornecido pela aplicação: decisões em vigor, não autorização
 * para executar operações.
 */
export type EstadoAtual = {
  marca: string;
  publico: string;
  formato: string;
  restricoes: string[];
};

/**
 * Um bloco do contexto montado. Os três tipos ficam separados para que
 * conteúdo do usuário nunca vire instrução da aplicação.
 */
export type BlocoDeContexto =
  | { tipo: "instrucoes"; texto: string }
  | { tipo: "estado"; dados: EstadoAtual }
  /** Resumo da conversa, como dados de contexto: não é instrução nem autorização. */
  | { tipo: "resumo"; texto: string }
  | { tipo: "mensagem"; papel: "usuario" | "assistente"; texto: string; rodada: number | "atual" };

/** Resultado da montagem: os blocos e o que entrou ou ficou fora. */
export type ContextoMontado = {
  blocos: BlocoDeContexto[];
  /** Números das rodadas que entraram, em ordem cronológica. */
  rodadasIncluidas: number[];
  /** Números das rodadas que ficaram fora do contexto (continuam no histórico). */
  rodadasForaDoContexto: number[];
};
