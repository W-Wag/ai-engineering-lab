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

const respostaFinalImediata = (): RespostaDoModelo => {
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

  if (tentativasDaConsulta === 1) {
    throw new ErroTemporario("Falha temporária simulada.");
  }
  return { horarios: [] };
};

const resultado = await executarHarness(
  respostaFinalImediata,
  executarFerramenta,
  esperarSimulada,
);

assert.equal(chamadasDoModelo, 2);
assert.equal(chamadasDaFerramenta, 2);
assert.deepEqual(resultado.resultadosDasFerramentas.length, 1);
assert.equal(resultado.motivoEncerramento, "resposta_final");
assert.deepEqual(esperasRegistradas, [1000]);

console.log("Teste de falha e sucesso aprovado.");
