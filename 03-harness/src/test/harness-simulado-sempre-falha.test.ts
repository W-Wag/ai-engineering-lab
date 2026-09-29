import assert from "node:assert/strict";
import {
  ErroTemporario,
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

const respostaComFalhas = (): RespostaDoModelo => {
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
  tentativasDaConsulta++;
  chamadasDaFerramenta++;

  console.log("tentativas: ", tentativasDaConsulta);
  throw new ErroTemporario("Falha temporária simulada.");
};

const resultado = await executarHarness(
  respostaComFalhas,
  executarFerramenta,
  esperarSimulada,
);

assert.equal(chamadasDoModelo, 1);
assert.equal(chamadasDaFerramenta, 2);
assert.deepEqual(resultado.resultadosDasFerramentas, []);
assert.equal(resultado.motivoEncerramento, "erro_ferramenta");
assert.deepEqual(esperasRegistradas, [1000]);

console.log("Teste de sempre falhar aprovado.");
