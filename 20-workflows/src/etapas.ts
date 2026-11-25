import { gravarFinalizacao, type Banco } from "./banco.js";
import type { Finalizacao, Rascunho } from "./tipos.js";

// Etapas SIMULADAS do workflow. Nenhum modelo, nenhum envio externo.
//
// Os contadores `chamadas` ficam EM MEMÓRIA: reiniciam a cada processo.
// Um contador zerado num processo novo NÃO prova que a etapa não foi
// repetida antes; para isso, conte os registros persistidos no banco.

export const log = (mensagem: string) => console.log(`[pid ${process.pid}] ${mensagem}`);

/** Gera o texto do rascunho a partir do tema. Determinístico. */
export function criarGerador() {
  const gerador = {
    chamadas: 0,
    gerar(tema: string): string {
      gerador.chamadas++;
      log(`gerador: rascunho gerado (chamada ${gerador.chamadas} neste processo)`);
      return `Rascunho sobre "${tema}": apresente o tema em três parágrafos curtos e termine com um convite para a loja.`;
    },
  };
  return gerador;
}

/** Erro da falha SIMULADA da investigação. */
export class FalhaSimulada extends Error {}

/**
 * Finalização LOCAL: registra o resultado na tabela `finalizacoes` do mesmo
 * banco. Não envia nada para fora. Não muda o estado da execução.
 *
 * INVESTIGAÇÃO: com `falharAposInserir` (desligado por padrão), lança uma
 * FalhaSimulada DEPOIS de inserir a finalização. Como o workflow chama o
 * finalizador dentro da transação, antes de atualizar o estado, a falha cai
 * entre as duas gravações. Nada além disso muda no caminho normal.
 */
export function criarFinalizador(opcoes: { falharAposInserir?: boolean } = {}) {
  const finalizador = {
    chamadas: 0,
    finalizar(banco: Banco, rascunho: Rascunho): Finalizacao {
      finalizador.chamadas++;
      const resultado = `Publicado localmente: ${rascunho.texto}`;
      const finalizacao = gravarFinalizacao(banco, rascunho.execucaoId, rascunho.id, resultado);
      if (opcoes.falharAposInserir) {
        log(`finalizador: finalização #${finalizacao.id} INSERIDA; FALHA SIMULADA antes de atualizar o estado`);
        throw new FalhaSimulada("falha simulada após inserir a finalização");
      }
      log(`finalizador: finalização #${finalizacao.id} registrada (chamada ${finalizador.chamadas} neste processo)`);
      return finalizacao;
    },
  };
  return finalizador;
}

export type Gerador = ReturnType<typeof criarGerador>;
export type Finalizador = ReturnType<typeof criarFinalizador>;
