// Produtor SIMULADO: devolve um texto fixo, fragmento por fragmento, com
// pequenas esperas para que a chegada progressiva e o cancelamento possam ser
// observados. Nenhum modelo é chamado.
//
// Cancelar este produtor só mostra o que acontece com um produtor sob nosso
// controle. Cancelar uma requisição local não comprova que um provedor real
// parou de gerar (nem de cobrar). Não há operações persistentes a desfazer.

/** Texto fixo, com acentos e emojis (caracteres de 2 a 4 bytes em UTF-8). */
export const TEXTO_FIXO =
  "A nova linha Aurora chegou: cafés com notas de chocolate 🍫, torra média " +
  "e aroma intenso. Cada xícara ☕ foi pensada para quem começa o dia sem " +
  "pressa, mas não abre mão de sabor. Experimente na loja mais próxima e " +
  "conte para nós qual combinação você preferiu.";

/** Divide em palavras, cada uma com o espaço que vem depois dela. */
export function dividirEmFragmentos(texto: string): string[] {
  return texto.match(/\S+\s*/g) ?? [];
}

/**
 * Espera cancelável. Ao terminar, por tempo ou por cancelamento, não deixa
 * timer nem listener pendurado no `signal`.
 */
export function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const aoCancelar = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aoCancelar);
      resolve();
    }, ms);
    signal.addEventListener("abort", aoCancelar, { once: true });
  });
}

/** Produz fragmentos até terminar ou até o `signal` ser cancelado. */
export type Produtor = (signal: AbortSignal) => AsyncIterable<string>;

export type OpcoesDoProdutor = {
  /** Espera antes do primeiro fragmento (fase "aguardando"). */
  atrasoInicialMs: number;
  /** Espera entre os fragmentos seguintes. */
  intervaloMs: number;
  texto?: string;
  /**
   * Só para verificação da infraestrutura: lança uma falha depois de
   * produzir esta quantidade de fragmentos. O servidor real não usa.
   */
  falharDepoisDe?: number;
};

export function criarProdutorSimulado(opcoes: OpcoesDoProdutor): Produtor {
  const fragmentos = dividirEmFragmentos(opcoes.texto ?? TEXTO_FIXO);

  return async function* produzir(signal) {
    for (let i = 0; i < fragmentos.length; i++) {
      await esperar(i === 0 ? opcoes.atrasoInicialMs : opcoes.intervaloMs, signal);
      if (i === opcoes.falharDepoisDe) {
        throw new Error("falha simulada no produtor");
      }
      yield fragmentos[i]!;
    }
  };
}
