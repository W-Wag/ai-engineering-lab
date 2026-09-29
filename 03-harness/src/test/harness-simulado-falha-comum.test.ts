import assert from "node:assert/strict";
import {
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

const respostaErroComum = (): RespostaDoModelo => {
  chamadasDoModelo++;

  if (chamadasDoModelo === 1) {
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

const executarFerramenta = () => {
  chamadasDaFerramenta++;
  tentativasDaConsulta++;
  console.log("tentativas: ", tentativasDaConsulta);

  throw new Error("Falha comum simulada.");
};

const resultado = await executarHarness(
  respostaErroComum,
  executarFerramenta,
  esperarSimulada,
);

assert.equal(chamadasDoModelo, 1);
assert.equal(chamadasDaFerramenta, 1);
assert.deepEqual(resultado.resultadosDasFerramentas, []);
assert.equal(resultado.motivoEncerramento, "erro_ferramenta");
assert.deepEqual(esperasRegistradas, []);

console.log("Teste de falha comum aprovado.");
