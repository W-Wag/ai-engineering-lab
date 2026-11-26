import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirBanco, listarTarefas, popularFila, type Banco } from "./banco.js";
import { consumirFila } from "./consumidor.js";
import { CONFIGURACAO } from "./dados.js";
import { adquirirProxima, processarTarefa } from "./fila.js";
import { criarInstrumentacao } from "./instrumentacao.js";
import { criarProcessador } from "./processador.js";

// Executor (infraestrutura). Cria um banco TEMPORÁRIO novo, popula a fila
// com os documentos fictícios, roda UM consumidor neste processo e imprime
// a evidência: linha do tempo, pico de ativos, intervalos entre inícios e
// estados finais lidos do banco. Não declara aprovação: os números falam.
//
// Uso (na pasta do módulo): npm run executar

const caminho = join(mkdtempSync(join(tmpdir(), "fila21-")), "fila.db");
const banco = abrirBanco(caminho);
popularFila(banco);

const instr = criarInstrumentacao();
const processar = criarProcessador(instr);
const adquirir = (b: Banco, executor: string) => {
  const tarefa = adquirirProxima(b, executor);
  if (tarefa) instr.adquirida(tarefa.id, executor);
  return tarefa;
};

console.log(`Banco temporário: ${caminho}`);
console.log(
  `Configuração (LOCAL a este consumidor): executor ${CONFIGURACAO.executor}, ` +
    `máximo ${CONFIGURACAO.maxConcorrencia} simultâneas, ` +
    `início a cada ≥ ${CONFIGURACAO.intervaloMinimoMs} ms\n`,
);

let erroDoConsumidor: unknown = null;
try {
  await consumirFila({ banco, processar, adquirir, processarTarefa }, CONFIGURACAO);
} catch (erro) {
  erroDoConsumidor = erro;
}

console.log("Linha do tempo (t em ms desde o início):");
for (const e of instr.estado.eventos) {
  console.log(
    `  t=${String(e.t).padStart(7)}  ${e.tipo.padEnd(10)} ${e.tarefaId}${e.executor ? ` (${e.executor})` : ""}  ativos=${e.ativos}`,
  );
}

const inicios = instr.estado.inicios;
const intervalos = inicios.slice(1).map((x, i) => Math.round((x.t - inicios[i]!.t) * 10) / 10);
const aquisicoes = new Map<string, number>();
for (const e of instr.estado.eventos) {
  if (e.tipo === "adquirida") aquisicoes.set(e.tarefaId, (aquisicoes.get(e.tarefaId) ?? 0) + 1);
}

console.log(`\nPico de tarefas ativas: ${instr.estado.pico} (limite configurado: ${CONFIGURACAO.maxConcorrencia})`);
console.log(`Intervalos entre inícios (ms): ${intervalos.join(", ") || "(nenhum)"}`);
console.log(`Menor intervalo: ${intervalos.length ? Math.min(...intervalos) : "-"} (política: ≥ ${CONFIGURACAO.intervaloMinimoMs})`);
console.log(`Aquisições por tarefa: ${[...aquisicoes].map(([id, n]) => `${id}×${n}`).join(", ") || "(nenhuma)"}`);

console.log("\nEstados finais (lidos do banco):");
for (const t of listarTarefas(banco)) {
  console.log(`  ${t.id}  ${t.estado.padEnd(11)} executor=${t.executor ?? "-"}  ${t.erro ? `erro="${t.erro}"` : ""}`);
}

if (erroDoConsumidor) {
  console.log(`\nO consumidor terminou com erro: ${(erroDoConsumidor as Error).message}`);
  process.exitCode = 1;
}
banco.close();
