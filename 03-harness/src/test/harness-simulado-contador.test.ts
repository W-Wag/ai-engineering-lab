import assert from "node:assert/strict";
import {
  ErroTemporario,
  ExecutarFerramenta,
  executarHarness,
  RespostaDoModelo,
} from "../harness-simulado.js";

let chamadasDoModelo = 0;
let chamadasDaFerramenta = 0;
let tentativasDaConsulta = 0;
const esperasRegistradas: number[] = [];

const esperarSimulada = async (ms: number): Promise<void> => {
  esperasRegistradas.push(ms);
};

const respostaFinal = (): RespostaDoModelo => {
  chamadasDoModelo++;

  if (chamadasDoModelo === 1) {
    return {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "carlos",
        data: "2026-10-20",
      },
    };
  }
  if (chamadasDoModelo === 2) {
    return {
      tipo: "solicitar_ferramenta",
      nome: "consultarDisponibilidade",
      argumentos: {
        profissionalId: "ana",
        data: "2026-10-20",
      },
    };
  }

  return {
    tipo: "resposta_final",
    texto: "Olá! Posso consultar horários.",
  };
};

const executarFerramenta: ExecutarFerramenta = (argumentos) => {
  chamadasDaFerramenta++;
  tentativasDaConsulta++;
  console.log("tentativas: ", tentativasDaConsulta);


  if (tentativasDaConsulta === 1) {
    throw new ErroTemporario("Falha temporária simulada.");
  }

  tentativasDaConsulta = 0;

    if (argumentos.profissionalId === "ana" && argumentos.data === "2026-10-20") {
      return { horarios: ["09:00", "14:00"] };
    }
  
  return { horarios: [] };
};

const resultado = await executarHarness(
  respostaFinal,
  executarFerramenta,
  esperarSimulada,
);

assert.equal(chamadasDoModelo, 3);
assert.equal(chamadasDaFerramenta, 4);
assert.deepEqual(resultado.resultadosDasFerramentas, [
  {
    nome: "consultarDisponibilidade",
    argumentos: {
      profissionalId: "carlos",
      data: "2026-10-20",
    },
    resultado: {
      horarios: [],
    },
  },
  {
    nome: "consultarDisponibilidade",
    argumentos: {
      profissionalId: "ana",
      data: "2026-10-20",
    },
    resultado: {
      horarios: ["09:00", "14:00"],
    },
  },
]);
assert.equal(resultado.motivoEncerramento, "resposta_final");
assert.deepEqual(esperasRegistradas, [1000, 1000]);

console.log("Teste de contador aprovado.");
