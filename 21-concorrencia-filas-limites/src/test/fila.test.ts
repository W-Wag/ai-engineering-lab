import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { abrirBanco, listarTarefas, popularFila, type Banco } from "../banco.js";
import { consumirFila } from "../consumidor.js";
import { CONFIGURACAO } from "../dados.js";
import { adquirirProxima, processarTarefa } from "../fila.js";
import { criarInstrumentacao } from "../instrumentacao.js";
import { criarLimiteDeConcorrencia, criarLimiteDeTaxa } from "../limites.js";
import { criarProcessador } from "../processador.js";

// Suíte de regressão do módulo 21. Cada teste usa um banco temporário novo.
//
// Tempo: os testes de rate limiting só verificam LIMITES INFERIORES de
// intervalo e nunca um limite superior. Timers do Node podem disparar alguns
// ms antes do instante medido por performance.now() (relógio do laço em
// cache, ms inteiros), e sob carga do executor de testes isso já passou de
// 2 ms. Por isso a suíte usa margens folgadas, que não dependem de precisão
// temporal irrealista. A garantia estrita (≥ 150 ms sem tolerância) NÃO é
// verificada aqui; ver README.
//
// O que pega uma regressão da lógica de verdade é o teste de "timer
// atrasado" do TODO 4: com a âncora no horário reservado (a primeira versão
// do TODO 4), o intervalo ali cai para ~2 ms; com a âncora no instante real,
// fica perto de 40 ms. A margem entre os dois é grande.

/** Margem do fluxo completo: smoke test de espaçamento, não prova de 150 ms. */
const TOLERANCIA_FLUXO_MS = 10;
const pasta = mkdtempSync(join(tmpdir(), "fila21-teste-"));
let contador = 0;
const novoBanco = (): Banco => {
  const banco = abrirBanco(join(pasta, `t${++contador}.db`));
  popularFila(banco);
  return banco;
};
/** Deixa as Promises já resolvidas rodarem (sem depender de tempo). */
const drenar = () => new Promise<void>((r) => setImmediate(r));

after(() => rmSync(pasta, { recursive: true, force: true }));

// ---------- TODO 1 ----------

test("TODO 1: aquisições sequenciais pegam tarefas distintas, gravam executor e terminam em null", () => {
  const banco = novoBanco();
  const ids: string[] = [];
  for (let i = 0; i < 10; i++) {
    const tarefa = adquirirProxima(banco, i % 2 ? "exec-B" : "exec-A");
    assert.ok(tarefa);
    assert.equal(tarefa.estado, "processando");
    assert.ok(tarefa.adquiridaEm);
    ids.push(tarefa.id);
  }
  assert.equal(new Set(ids).size, 10);
  assert.equal(adquirirProxima(banco, "exec-A"), null);
  assert.ok(listarTarefas(banco).every((t) => t.estado === "processando" && t.executor));
  banco.close();
});

// ---------- TODO 2 ----------

test("TODO 2: sucesso vira concluida; falha vira falha sem relançar; outro executor não sobrescreve", async () => {
  const banco = novoBanco();
  const processar = criarProcessador(criarInstrumentacao());
  const adquiridas = Array.from({ length: 6 }, () => adquirirProxima(banco, "exec-A")!);
  const [doc01, doc02, , , , doc06] = adquiridas;

  await processarTarefa(banco, processar, doc01!);
  await processarTarefa(banco, processar, doc06!); // não pode lançar
  await processarTarefa(banco, processar, { ...doc02!, executor: "exec-INTRUSO" });

  const por = new Map(listarTarefas(banco).map((t) => [t.id, t]));
  assert.equal(por.get("doc-01")!.estado, "concluida");
  assert.ok(por.get("doc-01")!.resultado && por.get("doc-01")!.terminadaEm);
  assert.equal(por.get("doc-06")!.estado, "falha");
  assert.match(por.get("doc-06")!.erro ?? "", /ilegível/);
  assert.equal(por.get("doc-02")!.estado, "processando");
  banco.close();
});

// ---------- TODO 3 ----------

test("TODO 3: o semáforo libera no máximo N e entrega a vaga a quem já esperava", async () => {
  const limite = criarLimiteDeConcorrencia(2);
  const entraram: number[] = [];
  for (const n of [1, 2, 3, 4]) void limite.ocupar().then(() => entraram.push(n));
  await drenar();
  assert.deepEqual(entraram, [1, 2]);

  limite.liberar();
  await drenar();
  assert.deepEqual(entraram, [1, 2, 3]);

  // vaga liberada com o 4 esperando: um pedido novo não passa na frente
  limite.liberar();
  void limite.ocupar().then(() => entraram.push(5));
  await drenar();
  assert.deepEqual(entraram, [1, 2, 3, 4]);
});

// ---------- TODO 4 ----------

test("TODO 4: chamadas sequenciais de aguardarVez ficam espaçadas (limite inferior folgado)", async () => {
  const intervalo = 40;
  const taxa = criarLimiteDeTaxa(intervalo);
  const vezes: number[] = [];
  for (let i = 0; i < 5; i++) {
    await taxa.aguardarVez();
    vezes.push(performance.now());
  }
  const intervalos = vezes.slice(1).map((v, i) => v - vezes[i]!);
  for (const v of intervalos) assert.ok(v >= intervalo * 0.75, `intervalo ${v.toFixed(1)} ms`);
});

test("TODO 4: com timer atrasado, a próxima vez se ancora no instante real da concessão", async () => {
  const intervalo = 40;
  const taxa = criarLimiteDeTaxa(intervalo);
  const primeira = taxa.aguardarVez();
  // Bloqueia o laço por 60 ms: a primeira vez é concedida bem depois do reservado.
  const ate = performance.now() + 60;
  while (performance.now() < ate) {
    /* espera ocupada proposital */
  }
  await primeira;
  const g1 = performance.now();
  await taxa.aguardarVez();
  const g2 = performance.now();
  // Âncora no reservado daria ~0–2 ms aqui; âncora no instante real, ~40 ms.
  assert.ok(g2 - g1 >= intervalo * 0.75, `intervalo entre concessões ${(g2 - g1).toFixed(1)} ms`);
});

// ---------- TODO 5 (fluxo completo) ----------

test("TODO 5: consumo completo respeita limites, registra a falha e não abandona tarefas", async () => {
  const banco = novoBanco();
  const instr = criarInstrumentacao();
  const processar = criarProcessador(instr);
  const adquirir = (b: Banco, executor: string) => {
    const tarefa = adquirirProxima(b, executor);
    if (tarefa) instr.adquirida(tarefa.id, executor);
    return tarefa;
  };

  await consumirFila({ banco, processar, adquirir, processarTarefa }, CONFIGURACAO);

  const tarefas = listarTarefas(banco);
  const eventos = instr.estado.eventos;
  const inicios = instr.estado.inicios;

  // todas processadas, nenhuma pendente nem abandonada em processando
  assert.equal(tarefas.length, 10);
  assert.ok(tarefas.every((t) => t.estado === "concluida" || t.estado === "falha"));
  // falha registrada e consumo continua
  assert.equal(tarefas.find((t) => t.id === "doc-06")!.estado, "falha");
  assert.equal(tarefas.filter((t) => t.estado === "concluida").length, 9);
  const tFalha = eventos.find((e) => e.tipo === "falhou")!.t;
  assert.ok(inicios.some((i) => i.t > tFalha), "houve início depois da falha");
  // cada tarefa adquirida uma vez (um consumidor, um processo)
  const aquisicoes = eventos.filter((e) => e.tipo === "adquirida").map((e) => e.tarefaId);
  assert.equal(aquisicoes.length, 10);
  assert.equal(new Set(aquisicoes).size, 10);
  // concorrência
  assert.ok(instr.estado.pico <= CONFIGURACAO.maxConcorrencia, `pico ${instr.estado.pico}`);
  assert.ok(eventos.every((e) => e.ativos <= CONFIGURACAO.maxConcorrencia));
  // rate limiting: smoke test de espaçamento (limite inferior folgado)
  const intervalos = inicios.slice(1).map((x, i) => x.t - inicios[i]!.t);
  for (const v of intervalos) {
    assert.ok(v >= CONFIGURACAO.intervaloMinimoMs - TOLERANCIA_FLUXO_MS, `intervalo ${v.toFixed(1)} ms`);
  }
  banco.close();
});
