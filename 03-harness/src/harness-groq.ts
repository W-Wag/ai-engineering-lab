import Groq from "groq-sdk";
import { pathToFileURL } from "node:url";
import { env } from "../../shared/env.js";
import {
  consultarDisponibilidade,
  eConsultaValida,
  Disponibilidade,
} from "./disponibilidade.js";
import { ChatCompletionToolMessageParam } from "groq-sdk/resources/chat.mjs";

export type MotivoDeEncerramento =
  | "resposta_final"
  | "sem_resposta"
  | "ferramenta_desconhecida"
  | "argumentos_invalidos"
  | "erro_ferramenta"
  | "erro_modelo"
  | "limite_atingido";

export type ErroSeguro = {
  nome: string;
  mensagem: string;
  status?: number;
};

export type EvidenciaDeFerramenta = {
  id: string;
  nome: string;
  argumentosBrutos: string;
  argumentosInterpretados?: unknown;
  resultado?: Disponibilidade;
};

export type ResultadoDoHarnessGroq = {
  entrada: string;
  chamadasAoModelo: number;
  ferramentasSolicitadas: EvidenciaDeFerramenta[];
  respostaFinal?: string;
  motivoDeEncerramento: MotivoDeEncerramento;
  erro?: ErroSeguro;
};

function transformarErro(erro: unknown): ErroSeguro {
  if (erro instanceof Error) {
    const possivelStatus = (erro as Error & { status?: unknown }).status;

    return {
      nome: erro.name,
      mensagem: erro.message,
      ...(typeof possivelStatus === "number"
        ? { status: possivelStatus }
        : {}),
    };
  }

  return {
    nome: "ErroDesconhecido",
    mensagem: "Ocorreu um erro não identificado.",
  };
}

function criarFerramentas(): Groq.Chat.ChatCompletionTool[] {
  return [
    {
      type: "function",
      function: {
        name: "consultarDisponibilidade",
        description:
          "Consulta os horários disponíveis de um profissional em uma data.",
        parameters: {
          type: "object",
          properties: {
            profissionalId: {
              type: "string",
              description: "Identificador do profissional",
            },
            data: {
              type: "string",
              description: "Data no formato YYYY-MM-DD",
            },
          },
          required: ["profissionalId", "data"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function criarInstrucoes(): string {
  return [
    "Você consulta disponibilidade de profissionais.",
    "Use a ferramenta para obter horários e não invente resultados.",
    "Peça esclarecimento se faltarem informações.",
    "Quando a ferramenta retornar horarios: [], informe apenas que não encontrou horários para o profissional e a data consultados.",
    "Esse resultado não permite afirmar que a agenda está lotada, que o profissional está indisponível, que não trabalha naquele dia ou que não existe.",
    "Não atribua uma causa à ausência de horários.",
    "Você pode apenas consultar disponibilidade.",
    "Não pode criar, reservar, alterar ou cancelar agendamentos.",
    "Não ofereça essas operações como se estivessem disponíveis.",
    "Neste contexto, a profissional Ana possui o identificador 'ana'.",
    "Neste contexto, o profissional Carlos possui o identificador 'carlos'.",
  ].join(" ");
}

export async function executarHarnessGroq(
  entrada: string,
): Promise<ResultadoDoHarnessGroq> {
  const resultado: ResultadoDoHarnessGroq = {
    entrada,
    chamadasAoModelo: 0,
    ferramentasSolicitadas: [],
    motivoDeEncerramento: "limite_atingido",
  };

  try {
    const groq = new Groq({
      apiKey: env.GROQ_API_KEY,
      timeout: 30_000,
      maxRetries: 0,
    });

    const ferramentas = criarFerramentas();
    const mensagens: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: criarInstrucoes() },
      { role: "user", content: entrada },
    ];

    for (let i = 0; i < 3; i++) {
      resultado.chamadasAoModelo++;

      let resposta: Groq.Chat.ChatCompletion;
      try {
        resposta = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: mensagens,
          tools: ferramentas,
          tool_choice: "auto",
        });
      } catch (erro) {
        resultado.motivoDeEncerramento = "erro_modelo";
        resultado.erro = transformarErro(erro);
        return resultado;
      }

      const mensagem = resposta.choices[0]?.message;

      if (!mensagem) {
        resultado.motivoDeEncerramento = "sem_resposta";
        return resultado;
      }

      mensagens.push(mensagem);
      const chamadas = mensagem.tool_calls ?? [];

      if (chamadas.length === 0) {
        if (typeof mensagem.content === "string" && mensagem.content) {
          resultado.respostaFinal = mensagem.content;
          resultado.motivoDeEncerramento = "resposta_final";
        } else {
          resultado.motivoDeEncerramento = "sem_resposta";
        }
        return resultado;
      }

      for (const chamada of chamadas) {
        const evidencia: EvidenciaDeFerramenta = {
          id: chamada.id,
          nome: chamada.function.name,
          argumentosBrutos: chamada.function.arguments,
        };
        resultado.ferramentasSolicitadas.push(evidencia);

        if (chamada.function.name !== "consultarDisponibilidade") {
          resultado.motivoDeEncerramento = "ferramenta_desconhecida";
          return resultado;
        }

        let argumentos: unknown;
        try {
          argumentos = JSON.parse(chamada.function.arguments);
          evidencia.argumentosInterpretados = argumentos;
        } catch (erro) {
          resultado.motivoDeEncerramento = "argumentos_invalidos";
          resultado.erro = transformarErro(erro);
          return resultado;
        }

        if (!eConsultaValida(argumentos)) {
          resultado.motivoDeEncerramento = "argumentos_invalidos";
          resultado.erro = {
            nome: "ArgumentosInvalidos",
            mensagem: "Os argumentos não estão válidos.",
          };
          return resultado;
        }

        let disponibilidade: Disponibilidade;
        try {
          disponibilidade = consultarDisponibilidade(argumentos);
        } catch (erro) {
          resultado.motivoDeEncerramento = "erro_ferramenta";
          resultado.erro = transformarErro(erro);
          return resultado;
        }

        evidencia.resultado = disponibilidade;
        const mensagemDaFerramenta: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: chamada.id,
          content: JSON.stringify(disponibilidade),
        };
        mensagens.push(mensagemDaFerramenta);
      }
    }

    resultado.motivoDeEncerramento = "limite_atingido";
    return resultado;
  } catch (erro) {
    resultado.motivoDeEncerramento = "erro_modelo";
    resultado.erro = transformarErro(erro);
    return resultado;
  }
}

async function main(): Promise<void> {
  const resultado = await executarHarnessGroq(
    "Quais horários a Ana tem em 20 de outubro de 2026?",
  );

  console.dir(resultado, { depth: null });

  if (resultado.motivoDeEncerramento !== "resposta_final") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error(transformarErro(erro));
    process.exitCode = 1;
  });
}
