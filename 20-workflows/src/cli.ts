import { abrirBanco, buscarExecucao, buscarFinalizacao, buscarRascunho, CAMINHO_PADRAO, contar, criarExecucao } from "./banco.js";
import { criarFinalizador, criarGerador, log } from "./etapas.js";
import { ErroDoWorkflow, TodoPendente } from "./tipos.js";
import { aprovar, retomar } from "./workflow.js";

// Terminal do workflow. Cada comando é um processo curto: abre o banco,
// faz uma coisa, imprime e termina.
//
//   npm run wf -- criar "<tema>"
//   npm run wf -- consultar <id>
//   npm run wf -- retomar <id>
//   npm run wf -- aprovar <id> <rascunhoId>
//
// Banco: BANCO_WORKFLOWS (se definido) ou dados/workflows.db.
// A aprovação pelo terminal é só uma ação explícita: NÃO é autenticação.

const caminho = process.env.BANCO_WORKFLOWS || CAMINHO_PADRAO;
const banco = abrirBanco(caminho);
// INVESTIGAÇÃO: FALHA_APOS_FINALIZACAO=1 liga a falha simulada (padrão: desligada).
const falharAposInserir = process.env.FALHA_APOS_FINALIZACAO === "1";
const deps = { banco, gerador: criarGerador(), finalizador: criarFinalizador({ falharAposInserir }) };
const [comando, ...args] = process.argv.slice(2);

function exigir(valor: string | undefined, nome: string): string {
  if (!valor) throw new Error(`faltou ${nome}`);
  return valor;
}

try {
  log(`banco: ${caminho} | comando: ${comando ?? "(nenhum)"}`);
  switch (comando) {
    case "criar": {
      const execucao = criarExecucao(banco, exigir(args.join(" ").trim() || undefined, "o tema"));
      log(`execução criada: ${execucao.id} (estado ${execucao.estado})`);
      break;
    }
    case "consultar": {
      // Só leitura: mostra o que está persistido.
      const id = exigir(args[0], "o ID da execução");
      const execucao = buscarExecucao(banco, id);
      if (!execucao) throw new ErroDoWorkflow("EXECUCAO_NAO_ENCONTRADA", `execução ${id} não existe`);
      const rascunho = execucao.rascunhoId ? buscarRascunho(banco, execucao.rascunhoId) : null;
      const finalizacao = buscarFinalizacao(banco, id);
      console.log(`  estado:       ${execucao.estado}`);
      console.log(`  rascunho:     ${rascunho ? `${rascunho.id} — ${rascunho.texto}` : "(nenhum)"}`);
      console.log(`  resultado:    ${finalizacao ? `#${finalizacao.id} — ${finalizacao.resultado}` : "(nenhum)"}`);
      console.log(`  persistido:   ${contar(banco, "rascunhos", id)} rascunho(s), ${contar(banco, "finalizacoes", id)} finalização(ões)`);
      break;
    }
    case "retomar": {
      const r = retomar(deps, exigir(args[0], "o ID da execução"));
      log(`retomada terminou em: ${r.situacao}`);
      if (r.situacao === "aguardando_aprovacao") {
        console.log(`  rascunho ${r.rascunho.id}: ${r.rascunho.texto}`);
        console.log(`  para aprovar: npm run wf -- aprovar ${r.execucao.id} ${r.rascunho.id}`);
      } else {
        console.log(`  resultado #${r.finalizacao.id}: ${r.finalizacao.resultado}`);
      }
      break;
    }
    case "aprovar": {
      const execucao = aprovar(deps, exigir(args[0], "o ID da execução"), exigir(args[1], "o ID do rascunho"));
      log(`estado da aprovação: ${execucao.estado}`);
      break;
    }
    default:
      console.log('uso: npm run wf -- criar "<tema>" | consultar <id> | retomar <id> | aprovar <id> <rascunhoId>');
      process.exitCode = 2;
  }
} catch (erro) {
  if (erro instanceof ErroDoWorkflow) log(`ERRO ${erro.codigo}: ${erro.message}`);
  else if (erro instanceof TodoPendente) log(erro.message);
  else log(`ERRO: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  log(`contadores EM MEMÓRIA deste processo: gerador ${deps.gerador.chamadas}, finalizador ${deps.finalizador.chamadas}`);
  banco.close();
}
