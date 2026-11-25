import {
  atualizarEstado,
  buscarExecucao,
  buscarFinalizacao,
  buscarRascunho,
  emTransacao,
  gravarRascunho,
  type Banco,
} from "./banco.js";
import type { Finalizador, Gerador } from "./etapas.js";
import {
  ErroDoWorkflow,
  TodoPendente,
  type Execucao,
  type ResultadoDaRetomada,
} from "./tipos.js";

// EXERCÍCIO do módulo 20: as decisões do fluxo ficam aqui.
//
//   pendente → aguardando_aprovacao → aprovado → concluido
//
// Cada comando do terminal é um processo curto: lê o estado persistido,
// faz no máximo uma etapa, grava e termina. Nada fica esperando a aprovação
// em memória, num loop ou numa transação aberta.
//
// Disponível em banco.ts: buscarExecucao, atualizarEstado, gravarRascunho,
// buscarRascunho, buscarFinalizacao, emTransacao(banco, () => { ... }).
// Em deps: gerador.gerar(tema) e finalizador.finalizar(banco, rascunho).
// Erros: new ErroDoWorkflow("EXECUCAO_NAO_ENCONTRADA" | "APROVACAO_INVALIDA"
// | "ESTADO_INVALIDO", mensagem).

export type Dependencias = { banco: Banco; gerador: Gerador; finalizador: Finalizador };

/** Comando `retomar`: avança a execução conforme o estado persistido. */
export function retomar(deps: Dependencias, id: string): ResultadoDaRetomada {
  // TODO 1: recupere a execução (inexistente → erro explícito) e decida a
  // ação conforme o estado, chamando a função certa abaixo:
  //   pendente → prepararRascunho; aguardando_aprovacao → apresentarEspera;
  //   aprovado → finalizar; concluido → recuperarConclusao.
  const execucao = buscarExecucao(deps.banco, id)
  if (!execucao) throw new ErroDoWorkflow("EXECUCAO_NAO_ENCONTRADA", `execução ${id} não existe`)

  switch (execucao.estado) {
    case "aguardando_aprovacao": return apresentarEspera(deps, execucao)
    case "pendente": return prepararRascunho(deps, execucao)
    case "aprovado": return finalizar(deps, execucao)
    case "concluido": return recuperarConclusao(deps, execucao)
  }
}

/** Estado pendente. */
function prepararRascunho(deps: Dependencias, execucao: Execucao): ResultadoDaRetomada {
  // TODO 2: gere o rascunho e, NA MESMA TRANSAÇÃO, grave-o e mude o estado
  // para aguardando_aprovacao com o rascunho vinculado. Devolva a espera.
  const gerarRascunho = deps.gerador.gerar(execucao.tema)

  const rascunho = emTransacao(deps.banco, () => {
    const rascunhoGravado = gravarRascunho(deps.banco, execucao.id, gerarRascunho)
    atualizarEstado(deps.banco, execucao.id, "aguardando_aprovacao", rascunhoGravado.id)
    return rascunhoGravado
  })

  const execucaoAtual = buscarExecucao(deps.banco, execucao.id)!
  return {situacao: "aguardando_aprovacao", execucao: execucaoAtual, rascunho}
}

/** Estado aguardando_aprovacao. */
function apresentarEspera(deps: Dependencias, execucao: Execucao): ResultadoDaRetomada {
  // TODO 3: devolva a espera com o rascunho JÁ gravado, sem gerar de novo e
  // sem finalizar.
  const rascunho = execucao.rascunhoId ? buscarRascunho(deps.banco, execucao.rascunhoId) : null
  if (!rascunho) throw new ErroDoWorkflow("ESTADO_INVALIDO", `execução ${execucao.id} não tem rascunho`)
  return {situacao: "aguardando_aprovacao", execucao, rascunho}
}

/** Comando `aprovar`: vinculado ao ID da execução e ao ID do rascunho apresentado. */
export function aprovar(deps: Dependencias, id: string, rascunhoId: string): Execucao {
  // TODO 4: valide o vínculo (a execução existe e o rascunhoId é o dela) e
  // faça a transição para aprovado. Vínculo errado: rejeite sem alterar
  // nada. Repetir uma aprovação válida não pode criar outra tarefa nem
  // fazer uma execução concluída voltar de estado.
  const execucao = buscarExecucao(deps.banco, id)
  if (!execucao) throw new ErroDoWorkflow("EXECUCAO_NAO_ENCONTRADA", `execução ${id} não existe`)
  if (execucao.rascunhoId !== rascunhoId) throw new ErroDoWorkflow("APROVACAO_INVALIDA", "o rascunho não é dessa execução")

  if (execucao.estado === "aprovado" || execucao.estado === "concluido") return execucao
  if (execucao.estado !== "aguardando_aprovacao") throw new ErroDoWorkflow("ESTADO_INVALIDO", `execução ${execucao.estado}`)

  atualizarEstado(deps.banco, execucao.id, "aprovado")
  return buscarExecucao(deps.banco, execucao.id)!
}

/** Estado aprovado. */
function finalizar(deps: Dependencias, execucao: Execucao): ResultadoDaRetomada {
  // TODO 5: registre a finalização e mude o estado para concluido JUNTOS.
  const rascunho = execucao.rascunhoId ? buscarRascunho(deps.banco, execucao.rascunhoId) : null
  if (!rascunho) throw new ErroDoWorkflow("ESTADO_INVALIDO", `execução ${execucao.id} não tem rascunho`)

  const finalizacao = emTransacao(deps.banco, () => {
    const finalizado = deps.finalizador.finalizar(deps.banco, rascunho)
    atualizarEstado(deps.banco, execucao.id, "concluido")
    return finalizado
  })
  return {situacao: "concluido", execucao: buscarExecucao(deps.banco, execucao.id)!, finalizacao}
}

/** Estado concluido. */
function recuperarConclusao(deps: Dependencias, execucao: Execucao): ResultadoDaRetomada {
  // TODO 6: devolva o resultado já registrado, sem finalizar de novo.
  const finalizacao = buscarFinalizacao(deps.banco, execucao.id)
  if (!finalizacao) throw new ErroDoWorkflow("ESTADO_INVALIDO", `execução ${execucao.id} não tem finalização`)
  return {situacao: "concluido", execucao: buscarExecucao(deps.banco, execucao.id)!, finalizacao}
}
