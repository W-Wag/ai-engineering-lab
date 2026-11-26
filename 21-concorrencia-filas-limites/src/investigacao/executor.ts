import { abrirBanco, paraTarefa, type Banco } from "../banco.js";
import { adquirirProxima, processarTarefa } from "../fila.js";
import type { Tarefa } from "../tipos.js";
import { aguardarLargada, aguardarTodos, chegar, registrar, type Cenario, type EventoInv } from "./comum.js";

// Um EXECUTOR da investigação, rodando em PROCESSO PRÓPRIO, com conexão
// própria ao banco. Iniciado pelo orquestrador (investigar.ts), nunca à mão.
//
//   node --import tsx src/investigacao/executor.ts <cenario> <banco> <pasta> <executor> <outro>
//
// Cenário "ingenuo": variante INSEGURA, só desta investigação. Lê a pendente
// com SELECT, espera o outro processo também ler (barreira) e só então faz
// um UPDATE INCONDICIONAL por ID, sem transação envolvendo os dois passos.
// Quem "atualizou" processa.
//
// Cenário "atomico": usa adquirirProxima (TODO 1 do Wagner) sem alteração.
// Só quem recebe uma tarefa processa.
//
// Contenção: busy_timeout de 5 s. Um SQLITE_BUSY que ainda assim aconteça é
// um ERRO (o processo termina com código 1), nunca "não havia tarefa".

const [cenario, caminhoDoBanco, pasta, executor, outro] = process.argv.slice(2) as [Cenario, string, string, string, string];
const ambos = [executor, outro];

const evento = (tipo: EventoInv["tipo"], extra: Partial<EventoInv> = {}) =>
  registrar(pasta, { t: Date.now(), pid: process.pid, executor, cenario, tipo, ...extra });

/** Processador da investigação: registra o início real do processamento. */
async function processar(tarefa: Tarefa): Promise<string> {
  evento("processamento_iniciado", { tarefaId: tarefa.id });
  await new Promise((r) => setTimeout(r, tarefa.duracaoMs));
  evento("processamento_concluido", { tarefaId: tarefa.id });
  return `Resumo simulado de "${tarefa.documento}" (por ${executor}, pid ${process.pid})`;
}

async function ingenuo(banco: Banco): Promise<void> {
  // 1. Lê a pendente (sem reservar nada).
  const lida = banco.prepare("SELECT id FROM tarefas WHERE estado = 'pendente' ORDER BY id LIMIT 1").get() as
    | { id: string }
    | undefined;
  if (!lida) throw new Error("cenário ingênuo: nenhuma pendente na leitura (inesperado com 1 tarefa)");
  evento("leitura", { tarefaId: lida.id });

  // 2. Barreira: ninguém atualiza antes de os dois terem lido.
  chegar(pasta, "leitura", executor);
  await aguardarTodos(pasta, "leitura", ambos);
  evento("barreira_leitura");

  // 3. UPDATE incondicional por ID (o defeito proposital).
  const r = banco
    .prepare("UPDATE tarefas SET estado = 'processando', executor = ?, adquirida_em = ? WHERE id = ?")
    .run(executor, new Date().toISOString(), lida.id);
  evento("atualizacao", { tarefaId: lida.id, detalhe: Number(r.changes) });
  if (Number(r.changes) !== 1) return;

  // 4. "Acha" que adquiriu: processa com a tarefa que leu, em nome próprio.
  const linha = banco.prepare("SELECT * FROM tarefas WHERE id = ?").get(lida.id) as Record<string, unknown>;
  await processarTarefa(banco, processar, { ...paraTarefa(linha), executor });
}

async function atomico(banco: Banco): Promise<void> {
  evento("tentativa_aquisicao");
  const tarefa = adquirirProxima(banco, executor);
  if (!tarefa) {
    evento("sem_tarefa");
    return;
  }
  evento("aquisicao", { tarefaId: tarefa.id });
  await processarTarefa(banco, processar, tarefa);
}

try {
  const banco = abrirBanco(caminhoDoBanco);
  banco.exec("PRAGMA busy_timeout = 5000");
  evento("inicio", { detalhe: caminhoDoBanco });

  chegar(pasta, "inicio", executor);
  const chegadas = await aguardarTodos(pasta, "inicio", ambos);
  evento("barreira_inicio");
  evento("largada", { detalhe: aguardarLargada(chegadas) });

  if (cenario === "ingenuo") await ingenuo(banco);
  else await atomico(banco);
  banco.close();
} catch (erro) {
  evento("erro", { detalhe: (erro as Error).message });
  process.exitCode = 1;
}
