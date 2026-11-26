import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirBanco, listarTarefas } from "../banco.js";
import { DOCUMENTOS } from "../dados.js";
import { TodoPendente } from "../tipos.js";
import { analisarAtomico, analisarIngenuo, compararCenarios, type ResumoDaRodada } from "./analise.js";
import { lerEventos, type Cenario, type EventoInv } from "./comum.js";

// ORQUESTRADOR da investigação: dois PROCESSOS independentes disputando a
// mesma tarefa no mesmo arquivo SQLite.
//
// Para cada rodada de cada cenário: pasta temporária nova, banco novo com UMA
// tarefa pendente, dois processos (exec-1 e exec-2) iniciados juntos. Depois
// lê os eventos de cada um, faz as verificações de infraestrutura e chama as
// suas análises (analise.ts).
//
// Uso (na pasta do módulo): npm run investigar            (3 rodadas)
//                           npm run investigar -- 5       (5 rodadas)

const RODADAS = Number(process.argv[2] ?? 3);
const EXECUTORES = ["exec-1", "exec-2"] as const;
const SCRIPT = fileURLToPath(new URL("./executor.ts", import.meta.url));

function prepararRodada() {
  const pasta = mkdtempSync(join(tmpdir(), "fila21-inv-"));
  const caminho = join(pasta, "fila.db");
  const banco = abrirBanco(caminho);
  const doc = DOCUMENTOS[0];
  banco
    .prepare("INSERT INTO tarefas (id, documento, duracao_ms, deve_falhar, estado) VALUES (?, ?, ?, 0, 'pendente')")
    .run(doc.id, doc.documento, 150);
  banco.close();
  return { pasta, caminho };
}

function iniciar(cenario: Cenario, caminho: string, pasta: string, executor: string, outro: string) {
  return new Promise<{ executor: string; codigo: number | null; saida: string }>((resolve) => {
    const filho = spawn(process.execPath, ["--import", "tsx", SCRIPT, cenario, caminho, pasta, executor, outro], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    filho.stdout.on("data", (d) => (saida += d));
    filho.stderr.on("data", (d) => (saida += d));
    filho.on("close", (codigo) => resolve({ executor, codigo, saida }));
  });
}

/** Verificações de INFRAESTRUTURA; qualquer falha invalida a rodada. */
function verificarInfra(cenario: Cenario, eventos: EventoInv[], caminho: string): void {
  const falhar = (m: string) => {
    throw new Error(`[${cenario}] verificação de infraestrutura falhou: ${m}`);
  };
  const erros = eventos.filter((e) => e.tipo === "erro");
  if (erros.length) falhar(`erro inesperado em ${erros.map((e) => `${e.executor}: ${e.detalhe}`).join("; ")}`);

  const pids = new Map(EXECUTORES.map((x) => [x, new Set(eventos.filter((e) => e.executor === x).map((e) => e.pid))]));
  for (const [x, s] of pids) if (s.size !== 1) falhar(`${x} com ${s.size} pids`);
  const [p1, p2] = EXECUTORES.map((x) => [...pids.get(x)!][0]);
  if (p1 === p2) falhar("os dois executores têm o mesmo pid");

  const inicios = eventos.filter((e) => e.tipo === "inicio");
  if (inicios.length !== 2 || !inicios.every((e) => e.detalhe === caminho)) falhar("os dois não abriram o mesmo banco");

  const largadas = eventos.filter((e) => e.tipo === "largada");
  if (largadas.length !== 2 || largadas[0]!.detalhe !== largadas[1]!.detalhe) falhar("os dois não partiram do mesmo instante");

  if (cenario === "ingenuo") {
    const leituras = eventos.filter((e) => e.tipo === "leitura");
    const atualizacoes = eventos.filter((e) => e.tipo === "atualizacao");
    if (leituras.length !== 2) falhar(`esperava 2 leituras, houve ${leituras.length}`);
    if (eventos.filter((e) => e.tipo === "barreira_leitura").length !== 2) falhar("barreira de leitura não alcançada pelos dois");
    const ultimaLeitura = Math.max(...leituras.map((e) => e.t));
    if (!atualizacoes.every((e) => e.t >= ultimaLeitura)) falhar("houve atualização antes de as duas leituras terminarem");
  } else {
    if (eventos.filter((e) => e.tipo === "tentativa_aquisicao").length !== 2) falhar("os dois não tentaram adquirir");
  }
  console.log(`  infraestrutura ok: pids ${p1} e ${p2}, mesmo banco, ${cenario === "ingenuo" ? "barreira de leitura alcançada pelos dois" : "duas tentativas de aquisição"}`);
}

async function rodada(cenario: Cenario, n: number): Promise<ResumoDaRodada | null> {
  const { pasta, caminho } = prepararRodada();
  console.log(`\n=== ${cenario.toUpperCase()} — rodada ${n}  (banco ${caminho})`);
  const resultados = await Promise.all([
    iniciar(cenario, caminho, pasta, EXECUTORES[0], EXECUTORES[1]),
    iniciar(cenario, caminho, pasta, EXECUTORES[1], EXECUTORES[0]),
  ]);
  for (const r of resultados) {
    if (r.codigo !== 0) throw new Error(`[${cenario}] ${r.executor} terminou com código ${r.codigo}\n${r.saida}`);
  }

  const eventos = EXECUTORES.flatMap((x) => lerEventos(pasta, x)).sort((a, b) => a.t - b.t);
  const t0 = eventos[0]?.t ?? 0;
  for (const e of eventos) {
    const extra = [e.tarefaId, e.detalhe === undefined || e.tipo === "inicio" ? undefined : `detalhe=${e.detalhe}`]
      .filter(Boolean)
      .join(" ");
    console.log(`  +${String(e.t - t0).padStart(4)}ms  ${e.executor} (pid ${e.pid})  ${e.tipo.padEnd(24)} ${extra}`);
  }
  verificarInfra(cenario, eventos, caminho);

  const banco = abrirBanco(caminho);
  const final = listarTarefas(banco)[0]!;
  banco.close();
  console.log(`  estado FINAL do banco (não é evidência suficiente): ${final.id} ${final.estado}, executor=${final.executor}`);

  try {
    return cenario === "ingenuo" ? analisarIngenuo(eventos) : analisarAtomico(eventos);
  } catch (erro) {
    if (erro instanceof TodoPendente) {
      console.log(`  (${erro.message})`);
      return null;
    }
    throw erro;
  }
}

const resumos: Record<Cenario, ResumoDaRodada[]> = { ingenuo: [], atomico: [] };
for (const cenario of ["ingenuo", "atomico"] as const) {
  for (let n = 1; n <= RODADAS; n++) {
    const r = await rodada(cenario, n);
    if (r) resumos[cenario].push(r);
  }
}

console.log("\n=== Comparação");
try {
  compararCenarios(resumos.ingenuo, resumos.atomico);
} catch (erro) {
  if (erro instanceof TodoPendente) console.log(`  (${erro.message})`);
  else throw erro;
}
