import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// INVESTIGAÇÃO do módulo 20: falha entre inserir a finalização e atualizar
// o estado para concluido.
//
// - Banco TEMPORÁRIO isolado (pasta nova em tmpdir); dados/workflows.db não
//   é tocado.
// - Cada comando roda em um PROCESSO SEPARADO (node + tsx + src/cli.ts), com
//   o mesmo arquivo de banco e o mesmo ID. O pid no log mostra isso.
// - A falha é uma exceção CONTROLADA (FALHA_APOS_FINALIZACAO=1), lançada
//   depois do INSERT e antes do UPDATE, dentro da transação do TODO 5.
//   Não é um encerramento abrupto do processo.
// - A inspeção abre o banco só para leitura.
//
// Uso (na pasta do módulo): npm run investigar

const pasta = mkdtempSync(join(tmpdir(), "wf20-investigacao-"));
const CAMINHO = join(pasta, "investigacao.db");

type Execucao = { status: number; saida: string };

/**
 * Roda um comando do terminal num processo novo e mostra a saída.
 * `esperaFalha`: o comando DEVE falhar com a falha simulada. Qualquer outro
 * desfecho (sucesso inesperado ou erro diferente) interrompe a investigação.
 */
function rodar(args: string[], opcoes: { falha?: boolean; esperaFalha?: boolean } = {}): Execucao {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      BANCO_WORKFLOWS: CAMINHO,
      FALHA_APOS_FINALIZACAO: opcoes.falha ? "1" : "0",
    },
  });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  console.log(`$ wf ${args.join(" ")}${opcoes.falha ? "   [FALHA HABILITADA]" : ""}`);
  for (const linha of saida.split("\n")) {
    if (linha.trim() && !linha.includes("banco:") && !linha.includes("ExperimentalWarning") && !linha.includes("--trace-warnings")) {
      console.log(`  ${linha}`);
    }
  }
  const falhouComoEsperado = r.status !== 0 && saida.includes("falha simulada");
  if (opcoes.esperaFalha && !falhouComoEsperado) {
    throw new Error(`esperava a falha simulada, mas o comando terminou com status ${r.status}`);
  }
  if (!opcoes.esperaFalha && r.status !== 0) {
    throw new Error(`erro inesperado (status ${r.status}) em: wf ${args.join(" ")}`);
  }
  return { status: r.status ?? -1, saida };
}

export type Inspecao = { estado: string; finalizacoes: number; idsDeFinalizacao: number[] };

/** Leitura direta do banco, sem passar pelo workflow e sem gravar nada. */
function inspecionar(id: string): Inspecao {
  const banco = new DatabaseSync(CAMINHO, { readOnly: true });
  try {
    const execucao = banco.prepare("SELECT estado FROM execucoes WHERE id = ?").get(id) as { estado: string };
    const ids = (banco.prepare("SELECT id FROM finalizacoes WHERE execucao_id = ? ORDER BY id").all(id) as { id: number }[])
      .map((l) => Number(l.id));
    return { estado: execucao.estado, finalizacoes: ids.length, idsDeFinalizacao: ids };
  } finally {
    banco.close();
  }
}

function mostrar(rotulo: string, inspecao: Inspecao): void {
  console.log(`  [inspeção] ${rotulo}: estado ${inspecao.estado}, ${inspecao.finalizacoes} finalização(ões) ${JSON.stringify(inspecao.idsDeFinalizacao)}`);
}

/** O número do resultado que o comando `retomar` imprimiu ("resultado #N"), ou null. */
function idDoResultadoNaSaida(saida: string): number | null {
  const m = saida.match(/resultado #(\d+)/);
  return m ? Number(m[1]) : null;
}

const capturar = (padrao: RegExp, texto: string) => {
  const m = texto.match(padrao);
  if (!m) throw new Error(`não encontrei ${padrao} na saída`);
  return m[0];
};

// ---------- 1. Preparar uma execução aprovada (preparado) ----------

console.log(`Banco temporário: ${CAMINHO}\n`);
const ID = capturar(/wf-[0-9a-f]{8}/, rodar(["criar", "Investigação da finalização"]).saida);
const RASCUNHO = capturar(/rs-[0-9a-f]{8}/, rodar(["retomar", ID]).saida);
rodar(["aprovar", ID, RASCUNHO]);
mostrar("antes da falha", inspecionar(ID));

// ---------- 2. Retomar com a falha habilitada (preparado) ----------

console.log("\n=== Retomada COM falha");
rodar(["retomar", ID], { falha: true, esperaFalha: true });

// ---------- Sua parte ----------
// Disponível: inspecionar(ID), mostrar(rotulo, inspecao),
// rodar(["retomar", ID]) (processo novo, falha desligada) e
// idDoResultadoNaSaida(saida).

// TODO 1: inspecione o banco depois da falha e compare com o esperado
// (estado aprovado e zero finalizações). Imprima a comparação.
const depoisDaFalha = inspecionar(ID)
mostrar("depois da execução que falhou", depoisDaFalha)

const estadoOk = depoisDaFalha.estado === "aprovado"
const finalizados = depoisDaFalha.finalizacoes === 0

console.log(` estado igual aprovado? ${estadoOk ? "sim" : "NÃo"}`)
console.log(` nenhuma finalização gravada? ${finalizados ? "sim" : "NÃo"}`)

// TODO 2: retome em outro processo, com a falha desabilitada. Inspecione e
// compare com o esperado (concluido e uma finalização). Guarde o ID da
// finalização registrada.
rodar(["retomar", ID])
const depoisDaRetomada = inspecionar(ID)
mostrar("depois da retomada", depoisDaRetomada)

console.log(` estado igual concluído? ${depoisDaRetomada.estado === "concluido" ? "sim" : "NÃO"}`)
console.log(` exatamente uma finalização? ${depoisDaRetomada.finalizacoes === 1 ? "sim" : "NÃO"}`)
const finalizacaoRegistrada = depoisDaRetomada.idsDeFinalizacao[0]


// TODO 3: retome mais uma vez. Compare o ID do resultado mostrado com o ID
// guardado no TODO 2 e confira que continua existindo um único registro.
const consulta = rodar(["retomar", ID])
const finalizacaoMostrada = idDoResultadoNaSaida(consulta.saida)
const depoisDaRepeticao = inspecionar(ID)

console.log(`  mesma finalização de antes? ${finalizacaoMostrada === finalizacaoRegistrada ? "sim" : "NÃO"}`)
console.log(`  ainda uma finalização só? ${depoisDaRepeticao.finalizacoes === 1 ? "sim" : "NÃO"}`)
