import assert from "node:assert/strict";
import {
  executarHarness,
  RespostaDoModelo,
} from "../harness-simulado.js";

let chamadasDoModelo = 0;
let chamadasDaFerramenta = 0;
const esperasRegistradas: number[] = [];

const esperarSimulada = async (ms: number): Promise<void> => {
  esperasRegistradas.push(ms);
};

const respostaFinalImediata = (): RespostaDoModelo => {
  chamadasDoModelo++;

  return {
    tipo: "solicitar_ferramenta",
    nome: "consultarDisponibilidade",
    argumentos: {
      profissionalId: "ana",
      data: "2026-10-20",
    },
  };
};

const executarFerramenta = () => {
  chamadasDaFerramenta++;
  return { horarios: [] };
};

const resultado = await executarHarness(
  respostaFinalImediata,
  executarFerramenta,
  esperarSimulada,
);

assert.equal(chamadasDoModelo, 3);
assert.equal(chamadasDaFerramenta, 3);
assert.deepEqual(resultado.resultadosDasFerramentas.length, 3);
assert.equal(resultado.motivoEncerramento, "limite_atingido");
assert.deepEqual(esperasRegistradas, []);

console.log("Teste de limite atingido aprovado.");
