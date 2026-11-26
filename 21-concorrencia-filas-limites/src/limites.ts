import { esperar } from "./processador.js";
import { TodoPendente } from "./tipos.js";

// EXERCÍCIO, parte 2: os dois limites. Ambos são LOCAIS: cada objeto criado
// aqui vale só dentro deste processo, para quem o usar. Não coordenam
// processos diferentes.
//
// Disponível: esperar(ms), performance.now().

/**
 * Limite de concorrência: no máximo `maximo` vagas ocupadas ao mesmo tempo.
 * - ocupar(): resolve quando houver vaga (e a ocupa);
 * - liberar(): devolve uma vaga, entregando-a a quem estiver esperando.
 */
export function criarLimiteDeConcorrencia(maximo: number) {
  // TODO 3: implemente ocupar e liberar.
  let ocupados = 0
  const disponibilidade: (() => void)[] = []

  return {
    async ocupar(): Promise<void> {
      if (ocupados < maximo) {ocupados++; return}
      await new Promise<void>((resolve) => disponibilidade.push(resolve))
    },
    liberar(): void {
      const proximo = disponibilidade.shift()
      if (proximo) proximo()
      else ocupados --
    },
  };
}

/**
 * Rate limiting por espaçamento fixo: cada chamada de aguardarVez() resolve
 * pelo menos `intervaloMinimoMs` depois da anterior.
 */
export function criarLimiteDeTaxa(intervaloMinimoMs: number) {
  // TODO 4: implemente aguardarVez.
  let ultimo = -Infinity

  return {
    async aguardarVez(): Promise<void> {
      const agora = performance.now()
      const proximo = Math.max(agora, ultimo + intervaloMinimoMs)
      ultimo = proximo
      await esperar(proximo - agora)

      const chegou = performance.now()
      ultimo = Math.max(ultimo, chegou)
    },
  };
}
