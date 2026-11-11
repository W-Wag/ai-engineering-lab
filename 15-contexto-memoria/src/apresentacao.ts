import type { ContextoMontado, Rodada } from "./tipos.js";

// Apresentação no terminal. Nada aqui decide o que entra no contexto.

export function imprimirHistorico(historico: readonly Rodada[]): void {
  console.log(`Histórico completo: ${historico.length} rodadas concluídas`);
  for (const rodada of historico) {
    console.log(`  #${rodada.numero} usuário: ${rodada.usuario}`);
  }
  console.log();
}

export function imprimirContexto(contexto: ContextoMontado, n: number, titulo = "Contexto montado"): void {
  console.log(`${titulo} com N = ${n}`);
  console.log(`  rodadas incluídas: ${listar(contexto.rodadasIncluidas)}`);
  console.log(`  rodadas fora do contexto: ${listar(contexto.rodadasForaDoContexto)}`);
  console.log();

  contexto.blocos.forEach((bloco, indice) => {
    const posicao = String(indice + 1).padStart(2, " ");
    if (bloco.tipo === "instrucoes") {
      console.log(`${posicao}. [INSTRUÇÕES DA APLICAÇÃO] ${bloco.texto}`);
    } else if (bloco.tipo === "estado") {
      console.log(`${posicao}. [ESTADO ATUAL, como dados] ${JSON.stringify(bloco.dados)}`);
    } else if (bloco.tipo === "resumo") {
      console.log(`${posicao}. [RESUMO, como dados] ${bloco.texto}`);
    } else {
      const origem = bloco.rodada === "atual" ? "mensagem atual" : `rodada #${bloco.rodada}`;
      console.log(`${posicao}. [MENSAGEM · ${bloco.papel} · ${origem}] ${bloco.texto}`);
    }
  });
  console.log();
}

function listar(numeros: number[]): string {
  return numeros.length === 0 ? "nenhuma" : numeros.map((n) => `#${n}`).join(", ");
}
