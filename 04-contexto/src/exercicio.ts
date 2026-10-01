import {
  INSTRUCOES_SYSTEM,
  Mensagem,
  processarRodada,
} from "./processar-rodada.js";

const primeiraEntrada = "Quais horários a Ana tem disponíveis?";
const segundaEntrada = "20 de outubro de 2026.";

async function main(): Promise<void> {
  // TODO: crie o histórico inicial usando INSTRUCOES_SYSTEM.
  let mensagens: Mensagem[] = [];
  mensagens.push({
    role: "system",
    content: INSTRUCOES_SYSTEM
  })

  // TODO: adicione primeiraEntrada ao histórico.
  mensagens.push({
    role: "user",
    content: primeiraEntrada
  })

  // TODO: processe a rodada e incorpore as novas mensagens ao histórico.
  const resultadoProcesso = await processarRodada(mensagens);

  mensagens.push(...resultadoProcesso)
  // TODO: adicione segundaEntrada ao histórico.
   mensagens.push({
    role: "user",
    content: segundaEntrada
  })

  // TODO: processe a próxima rodada usando o histórico acumulado.
  
   const resultadoSegundoProcesso = await processarRodada(mensagens);

   mensagens.push(...resultadoSegundoProcesso)

  // TODO: exiba a resposta final para o usuário.

  const resultadoFinal = await processarRodada(mensagens)

  const resultadoFiltrado = resultadoFinal.filter((processo) => processo.role === "assistant")

  console.dir(resultadoFiltrado, {depth: null})
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
