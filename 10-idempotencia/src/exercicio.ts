import {
  contarGravacoes,
  gravarAgendamento,
} from "../../09-acoes-seguras/src/gravacao.js";
import type {
  Confirmacao,
  SessaoAutenticada,
} from "../../09-acoes-seguras/src/tipos.js";
import { verificarSolicitacao } from "../../09-acoes-seguras/src/verificacoes.js";
import {
  consultarOperacao,
  montarChaveOperacao,
  registrarOperacao,
} from "./armazenamento.js";
import { confirmacao, confirmacaoConflito, criarSolicitacaoComChave, sessao } from "./dados.js";
import type { ResultadoIdempotente, SolicitacaoIdempotente } from "./tipos.js";

// Objetivo: duas chamadas com a mesma chave e os mesmos dados devolvem o mesmo
// agendamento, com apenas uma gravação. Chamadas sequenciais, em memória.

function executarIdempotente(
  sessao: SessaoAutenticada,
  solicitacao: SolicitacaoIdempotente,
  confirmacao: Confirmacao,
): ResultadoIdempotente {
  // Pronto: as verificações do módulo 09 rodam em toda chamada, inclusive
  // antes de devolver um resultado armazenado. Conhecer a chave não concede
  // acesso ao resultado. Bloqueios não são registrados como operações.
  const motivo = verificarSolicitacao(sessao, solicitacao, confirmacao);
  if (motivo !== undefined) {
    return { tipo: "bloqueado", motivo };
  }

  // Pronto: a chave é delimitada pelo usuário da sessão e pelo tipo de
  // operação, além do valor informado.
  const chave = montarChaveOperacao(sessao, solicitacao.chaveIdempotencia);

  // TODO 1: consulte o registro da operação com consultarOperacao.

  const consulta = consultarOperacao(chave);

  // TODO 2: se existir registro, compare explicitamente cliente, profissional,
  // data e horário da solicitação com os dados registrados.
  // TODO 2.1: se forem iguais, devolva o resultado registrado como
  // "reutilizado", sem gravar.
  // TODO 2.2: se forem diferentes, devolva "conflito" com motivo, sem gravar e
  // sem substituir o registro anterior.

  if (typeof consulta !== "undefined") {
    const campos = ["cliente", "data", "horario", "profissional"] as const;

    const diferentes = campos.filter(
      (campo) => solicitacao[campo] !== consulta.dados[campo],
    );

    if (diferentes.length > 0) {
      return {
        tipo: "conflito",
        motivo: `Os dados da operação divergem do que está registrado nessa chave nos seguintes campos: ${diferentes.join(", ")}`,
      };
    } else {
      return { tipo: "reutilizado", agendamento: consulta.resultado };
    }
  }

  // TODO 3: se não existir registro, grave com gravarAgendamento.
  // TODO 3.1: registre a operação com registrarOperacao, passando os dados
  // aprovados e o agendamento criado.
  // TODO 3.2: devolva o resultado como "criado". Substitua o retorno abaixo.
  const gravar = gravarAgendamento(confirmacao.dados);
  registrarOperacao(chave, confirmacao.dados, gravar);
  return { tipo: "criado", agendamento: gravar };
}

function idDoAgendamento(resultado: ResultadoIdempotente): number | undefined {
  return resultado.tipo === "criado" || resultado.tipo === "reutilizado"
    ? resultado.agendamento.id
    : undefined;
}

function main(): void {
  // As três chamadas usam o mesmo armazenamento, sem reinicialização: dados
  // iguais (criação), mesma chave com outro horário confirmado (conflito) e
  // dados originais de novo (reutilização).
  const primeira = executarIdempotente(
    sessao,
    criarSolicitacaoComChave(),
    confirmacao,
  );
  const segunda = executarIdempotente(
    sessao,
    criarSolicitacaoComChave(true),
    confirmacaoConflito,
  );
  const terceira = executarIdempotente(
    sessao,
    criarSolicitacaoComChave(),
    confirmacao,
  );

  console.log("Primeira chamada:", primeira);
  console.log("Segunda chamada:", segunda);
  console.log("Terceira chamada:", terceira);
  console.log("ID do agendamento na primeira:", idDoAgendamento(primeira));
  console.log("ID do agendamento na segunda:", idDoAgendamento(segunda));
  console.log("ID do agendamento na terceira:", idDoAgendamento(terceira));
  console.log("Quantidade de gravações:", contarGravacoes());
}

main();
