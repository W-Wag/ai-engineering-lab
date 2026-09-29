import {
  ConsultaDisponibilidade,
  consultarDisponibilidade,
  Disponibilidade,
} from "./disponibilidade.js";
import { pathToFileURL } from "node:url";

export type RespostaDoModelo =
  | {
      tipo: "solicitar_ferramenta";
      nome: string;
      argumentos: ConsultaDisponibilidade;
    }
  | {
      tipo: "resposta_final";
      texto: string;
    };

export type ResultadoDaFerramenta = {
  nome: string;
  argumentos: ConsultaDisponibilidade;
  resultado: Disponibilidade;
};

type MotivoEncerramento =
  | "resposta_final"
  | "sem_resposta"
  | "limite_atingido"
  | "ferramenta_desconhecida"
  | "erro_ferramenta";

export type SimularModelo = (
  resultados: ResultadoDaFerramenta[],
) => RespostaDoModelo;

export type ExecutarFerramenta = (
  argumentos: ConsultaDisponibilidade,
) => Disponibilidade;

export type Esperar = (ms: number) => Promise<void>

export class ErroTemporario extends Error {}

function esperarReal(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simularModelo(resultados: ResultadoDaFerramenta[]): RespostaDoModelo {
  if (resultados.length <= 0) {
    return {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "carlos",
        data: "2026-10-20",
      },
    };
  }

  const ultimoResultado = resultados[resultados.length - 1];
  const horarios = ultimoResultado.resultado.horarios;

  if (
    ultimoResultado.argumentos.profissionalId === "carlos" &&
    horarios.length <= 0
  ) {
    return {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "ana",
        data: "2026-10-20",
      },
    };
  }

  if (horarios.length > 0) {
    return {
      tipo: "resposta_final",
      texto: `Para esse profissional ${ultimoResultado.argumentos.profissionalId} os horários disponíveis são ${horarios.join(", ")}`,
    };
  }

  return {
    tipo: "resposta_final",
    texto: "Não encontrei horários para a consulta solicitada.",
  };
}

export type ResultadoDoHarness = {
  motivoEncerramento: MotivoEncerramento;
  resultadosDasFerramentas: ResultadoDaFerramenta[];
};

export async function executarHarness(
  modelo: SimularModelo = simularModelo,
  executarFerramenta?: ExecutarFerramenta,
  esperar?: Esperar
): Promise<ResultadoDoHarness> {
  const limiteDeChamadas = 3;
  let motivoEncerramento: MotivoEncerramento = "limite_atingido";
  const resultadosDasFerramentas: ResultadoDaFerramenta[] = [];
  let tentativasDaConsulta = 0;
  let falhasSimuladas = 0;

  const executarConsultaComFalhaTemporaria: ExecutarFerramenta = (
    argumentos,
  ) => {
    falhasSimuladas++;

    if (falhasSimuladas === 1) {
      throw new ErroTemporario("Falha temporária simulada.");
    }

    return consultarDisponibilidade(argumentos);
  };

  const executarFerramentaAtual =
    executarFerramenta ?? executarConsultaComFalhaTemporaria;
  const esperarAtual =
    esperar ?? esperarReal;

  for (let i = 0; i < limiteDeChamadas; i++) {
    console.log(`Chamada de número: ${i + 1}`);

    const respostaAtual = modelo(resultadosDasFerramentas);

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
          tentativasDaConsulta++;
          resultado = executarFerramentaAtual(respostaAtual.argumentos);
          resultadosDasFerramentas.push({
            nome: respostaAtual.nome,
            argumentos: respostaAtual.argumentos,
            resultado,
          });

          console.log("\nConsulta executada!\n");
          tentativasDaConsulta = 0
          break;
        } catch (erro) {
          console.error(
            erro instanceof Error
              ? erro.message
              : "Erro desconhecido ao executar a ferramenta",
          );

          if (erro instanceof ErroTemporario && tentativasDaConsulta < 2) {
            console.log("Falha temporária. Nova tentativa em 1 segundo.");
            await esperarAtual(1_000);
            continue;
          }

          motivoEncerramento = "erro_ferramenta";
          break;
        }
      }

      if (motivoEncerramento === "erro_ferramenta") {
        console.log("Ocorreu um erro ao executar a ferramenta");
        break;
      }
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

  return { motivoEncerramento, resultadosDasFerramentas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executarHarness();
}
