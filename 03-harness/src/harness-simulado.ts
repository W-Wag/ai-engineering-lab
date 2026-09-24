import {
  ConsultaDisponibilidade,
  consultarDisponibilidade,
  Disponibilidade,
} from "./disponibilidade.js";

type RespostaDoModelo =
  | {
      tipo: "solicitar_ferramenta";
      nome: string;
      argumentos: {
        profissionalId: string;
        data: string;
      };
    }
  | {
      tipo: "resposta_final";
      texto: string;
    };

type ResultadoDaFerramenta = {
  nome: string;
  argumentos?: {
    profissionalId: string;
    data: string;
  };
  resultado: { horarios: string[] };
};

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simularModelo(resultados: ResultadoDaFerramenta[]): RespostaDoModelo {
  if (resultados.length <= 0) {
    const novaSolicitacao: RespostaDoModelo = {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "carlos",
        data: "2026-10-20",
      },
    };

    return novaSolicitacao;
  }


  const ultimoResultado = resultados[resultados.length - 1];
  const horarios = ultimoResultado.resultado.horarios;

    if (ultimoResultado.argumentos?.profissionalId === "carlos" && horarios.length <= 0) {
    tentativasDaConsulta = 0
    const novaSolicitacao: RespostaDoModelo = {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "ana",
        data: "2026-10-20",
      },
    };

    return novaSolicitacao;
  }

  if (horarios.length > 0) {
    const horariosDisponiveis = horarios.join(", ");
    return {
      tipo: "resposta_final",
      texto: `Para esse profissional ${ultimoResultado.argumentos?.profissionalId} os horários disponíveis são ${horariosDisponiveis}`,
    };
  }

  return {
    tipo: "resposta_final",
    texto: "Não encontrei horários para a consulta solicitada.",
  };
}

// function simularModeloRepetitivo(
//   _resultados: ResultadoDaFerramenta[]
// ): RespostaDoModelo {
//   return {
//     tipo: "solicitar_ferramenta",
//     nome: "consultarDisponibilidade",
//     argumentos: {
//       profissionalId: "ana",
//       data: "2026-10-20",
//     },
//   };
// }

// const respostasSimuladas: RespostaDoModelo[] = [
//   {
//     tipo: "solicitar_ferramenta",
//     nome: "consultarDisponibilidade",
//     argumentos: {
//       profissionalId: "ana",
//       data: "2026-10-20",
//     },
//   },
//   {
//     tipo: "resposta_final",
//     texto: "Encontrei horários às 09:00 e às 14:00.",
//   },
// ];

const limiteDeChamadas = 3;

let motivoEncerramento:
  | "resposta_final"
  | "sem_resposta"
  | "limite_atingido"
  | "ferramenta_desconhecida"
  | "erro_ferramenta" = "limite_atingido";

const resultadosDasFerramentas: {
  nome: string;
  argumentos: {
    profissionalId: string;
    data: string;
  };
  resultado: { horarios: string[] };
}[] = [];

let tentativasDaConsulta = 0;

function executarConsultaComFalhaTemporaria(
  argumentos: ConsultaDisponibilidade,
): Disponibilidade {
  tentativasDaConsulta++;
  console.log("tentativas: ", tentativasDaConsulta);

  if (tentativasDaConsulta === 1) {
    throw new ErroTemporario("Falha temporária simulada.");
  }

  return consultarDisponibilidade(argumentos);
}

class ErroTemporario extends Error {}

for (let i = 0; i < limiteDeChamadas; i++) {
  console.log(`Chamada de número: ${i + 1}`);

  const respostaAtual = simularModelo(resultadosDasFerramentas);

  if (!respostaAtual) {
    console.log("Mais nenhuma resposta encontrada");
    motivoEncerramento = "sem_resposta";
    break;
  }

  if (respostaAtual.tipo === "solicitar_ferramenta") {
    if (respostaAtual.nome !== "consultarDisponibilidade") {
      console.log("Essa ferramenta não esta disponível");
      motivoEncerramento = "ferramenta_desconhecida";
      break;
    }

    let resultado: Disponibilidade;
    while (tentativasDaConsulta < 2) {
      try {
        resultado = executarConsultaComFalhaTemporaria(
          respostaAtual.argumentos,
        );
        resultadosDasFerramentas.push({
          nome: respostaAtual.nome,
          argumentos: respostaAtual.argumentos,
          resultado: resultado,
        });

        console.log("\nConsulta executada!\n");
        break;
      } catch (erro) {
        console.error(
          erro instanceof Error
            ? erro.message
            : "Erro desconhecido ao executar a ferramenta",
        );

        if (erro instanceof ErroTemporario && tentativasDaConsulta < 2) {
          console.log("Falha temporária. Nova tentativa em 1 segundo.");
          await esperar(1_000);
          continue;
        }
        motivoEncerramento = "erro_ferramenta";
        break;
      }
    }
  }

  if (motivoEncerramento === "erro_ferramenta") {
    console.log("Ocorreu um erro ao executar a ferramenta");
    break;
  }

  if (respostaAtual.tipo === "resposta_final") {
    console.log(respostaAtual.texto);
    motivoEncerramento = "resposta_final";
    break;
  }
}

console.log("Resultados Registrados: ");
console.dir(resultadosDasFerramentas, { depth: null });

console.log("Motivo de encerramento: ", motivoEncerramento);
