import {
  INSTRUCOES_SYSTEM,
  Mensagem,
  processarRodada,
} from "./processar-rodada.js";
import {
  consultarDisponibilidade,
  eConsultaValida,
} from "../../03-harness/src/disponibilidade.js";

type Conversa = "A" | "B";
type ProcessadorDeRodada = (
  mensagens: readonly Mensagem[],
  conversa: Conversa,
) => Promise<Mensagem[]>;

const entradas: Record<Conversa, string> = {
  A: "Quais horários a Ana tem disponíveis?",
  B: "Quais horários Carlos tem disponíveis?",
};

const datas: Record<Conversa, string> = {
  A: "20 de outubro de 2026.",
  B: "20 de outubro de 2026.",
};

function criarProcessadorSimulado(): ProcessadorDeRodada {
  return async (mensagens, conversa) => {
    const houveData = mensagens.some(
      (mensagem) => mensagem.role === "user" && mensagem.content === datas[conversa],
    );

    if (!houveData) {
      return [
        {
          role: "assistant",
          content: "Qual data você deseja consultar?",
        },
      ];
    }

    const profissionalId = conversa === "A" ? "ana" : "carlos";
    return [
      {
        role: "assistant",
        tool_calls: [
          {
            id: `sim-${conversa}`,
            type: "function",
            function: {
              name: "consultarDisponibilidade",
              arguments: JSON.stringify({
                profissionalId,
                data: "2026-10-20",
              }),
            },
          },
        ],
      },
    ];
  };
}

async function processarConversa(
  conversa: Conversa,
  historico: Mensagem[],
  processador: ProcessadorDeRodada,
): Promise<void> {
  historico.push({ role: "user", content: entradas[conversa] });
  console.log(`Histórico ${conversa} antes da primeira rodada:`);
  console.dir(historico, { depth: null });

  historico.push(...(await processador(historico, conversa)));
  historico.push({ role: "user", content: datas[conversa] });
  console.log(`Histórico ${conversa} antes da segunda rodada:`);
  console.dir(historico, { depth: null });

  const novasMensagens = await processador(historico, conversa);
  historico.push(...novasMensagens);

  for (const mensagem of novasMensagens) {
    if (mensagem.role !== "assistant") continue;

    for (const chamada of mensagem.tool_calls ?? []) {
      const argumentos: unknown = JSON.parse(chamada.function.arguments);
      if (
        chamada.function.name !== "consultarDisponibilidade" ||
        !eConsultaValida(argumentos)
      ) {
        throw new Error("Solicitação simulada inválida.");
      }

      historico.push({
        role: "tool",
        tool_call_id: chamada.id,
        content: JSON.stringify(consultarDisponibilidade(argumentos)),
      });
    }
  }
}

async function main(): Promise<void> {
  const modoApi = process.argv.includes("--api");
  const processador = modoApi
    ? async (mensagens: readonly Mensagem[]) => processarRodada(mensagens)
    : criarProcessadorSimulado();

  const historicosA: Mensagem[] = [
    { role: "system", content: INSTRUCOES_SYSTEM },
  ];
  const historicosB: Mensagem[] = [
    { role: "system", content: INSTRUCOES_SYSTEM },
  ];

  await processarConversa("A", historicosA, processador);
  await processarConversa("B", historicosB, processador);
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
