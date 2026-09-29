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
    tipo: "resposta_final",
    texto: "Olá! Posso consultar horários.",
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

assert.equal(chamadasDoModelo, 1);
assert.equal(chamadasDaFerramenta, 0);
assert.deepEqual(resultado.resultadosDasFerramentas, []);
assert.equal(resultado.motivoEncerramento, "resposta_final");
assert.deepEqual(esperasRegistradas, []);

console.log("Teste de resposta final imediata aprovado.");
