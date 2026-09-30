import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  executarHarnessGroq,
  ResultadoDoHarnessGroq,
} from "./harness-groq.js";

export type Caso =
  | "ana-sem-data"
  | "carlos-sem-horarios"
  | "ana-com-horarios"
  | "reserva-nao-disponivel";
type Classificacao = "aprovado" | "reprovado" | "nao_avaliado";
type CriterioAutomatico = {
  identificacao: string;
  classificacao: Classificacao;
  justificativa: string;
};

const casos: Record<Caso, string> = {
  "ana-sem-data": "Quais horários a Ana tem disponíveis?",
  "carlos-sem-horarios":
    "Quais horários Carlos tem disponíveis em 20 de outubro de 2026?",
  "ana-com-horarios":
    "Quais horários a Ana tem em 20 de outubro de 2026?",
  "reserva-nao-disponivel":
    "Reserve para mim um horário com a Ana em 20 de outubro de 2026, às 09:00.",
};

function concluida(resultado: ResultadoDoHarnessGroq): boolean {
  return (
    !resultado.erro &&
    resultado.motivoDeEncerramento === "resposta_final" &&
    typeof resultado.respostaFinal === "string" &&
    resultado.respostaFinal.trim().length > 0
  );
}

export function criteriosPara(
  caso: Caso,
  resultado: ResultadoDoHarnessGroq,
): CriterioAutomatico[] {
  if (!concluida(resultado)) {
    const ids =
      caso === "ana-sem-data"
        ? ["nenhuma-ferramenta-solicitada"]
        : caso === "carlos-sem-horarios"
          ? [
              "solicitacao-consultar-disponibilidade",
              "argumentos-carlos-data-correta",
              "resultado-horarios-vazio",
            ]
          : caso === "ana-com-horarios"
            ? [
                "solicitacao-consultar-disponibilidade",
                "argumentos-ana-data-correta",
                "resultado-horarios-exatos",
              ]
            : ["ferramentas-permitidas", "argumentos-ana-data-correta"];
    return ids.map((identificacao) => ({
      identificacao,
      classificacao: "nao_avaliado",
      justificativa: `Execução incompleta: motivo ${resultado.motivoDeEncerramento}.`,
    }));
  }

  if (caso === "ana-sem-data") {
    const passou = resultado.ferramentasSolicitadas.length === 0;
    return [
      {
        identificacao: "nenhuma-ferramenta-solicitada",
        classificacao: passou ? "aprovado" : "reprovado",
        justificativa: passou
          ? "Nenhuma ferramenta foi solicitada."
          : "Foi solicitada pelo menos uma ferramenta.",
      },
    ];
  }

  const solicitacoes = resultado.ferramentasSolicitadas;

  if (caso === "reserva-nao-disponivel") {
    const ferramentasPermitidas = solicitacoes.every(
      (item) => item.nome === "consultarDisponibilidade",
    );
    const argumentosAnaCorretos = solicitacoes.every((item) => {
      const args = item.argumentosInterpretados;
      return (
        typeof args === "object" &&
        args !== null &&
        !Array.isArray(args) &&
        (args as Record<string, unknown>).profissionalId === "ana" &&
        (args as Record<string, unknown>).data === "2026-10-20"
      );
    });
    return [
      {
        identificacao: "ferramentas-permitidas",
        classificacao: ferramentasPermitidas ? "aprovado" : "reprovado",
        justificativa: ferramentasPermitidas
          ? solicitacoes.length === 0
            ? "Nenhuma consulta foi solicitada; a consulta era opcional."
            : "Todas as ferramentas solicitadas foram consultarDisponibilidade."
          : "Foi solicitada uma ferramenta diferente de consultarDisponibilidade.",
      },
      {
        identificacao: "argumentos-ana-data-correta",
        classificacao: argumentosAnaCorretos ? "aprovado" : "reprovado",
        justificativa: argumentosAnaCorretos
          ? solicitacoes.length === 0
            ? "Nenhuma consulta foi solicitada; não havia argumentos a validar."
            : "Todas as consultas usaram ana e 2026-10-20."
          : "Alguma consulta não usou os valores esperados.",
      },
    ];
  }
  const ferramentaCorreta =
    solicitacoes.length > 0 &&
    solicitacoes.every((item) => item.nome === "consultarDisponibilidade");
  const argumentosCorretos =
    solicitacoes.length > 0 &&
    solicitacoes.every((item) => {
      const args = item.argumentosInterpretados;
      return (
        typeof args === "object" &&
        args !== null &&
        !Array.isArray(args) &&
        (args as Record<string, unknown>).profissionalId === "carlos" &&
        (args as Record<string, unknown>).data === "2026-10-20"
      );
    });
  const resultadosVazios =
    solicitacoes.length > 0 &&
    solicitacoes.every(
      (item) =>
        Array.isArray(item.resultado?.horarios) &&
        item.resultado.horarios.length === 0,
    );

  if (caso === "ana-com-horarios") {
    const argumentosAnaCorretos =
      solicitacoes.length > 0 &&
      solicitacoes.every((item) => {
        const args = item.argumentosInterpretados;
        return (
          typeof args === "object" &&
          args !== null &&
          !Array.isArray(args) &&
          (args as Record<string, unknown>).profissionalId === "ana" &&
          (args as Record<string, unknown>).data === "2026-10-20"
        );
      });
    const resultadosAnaCorretos =
      solicitacoes.length > 0 &&
      solicitacoes.every((item) => {
        const horarios = item.resultado?.horarios;
        return (
          Array.isArray(horarios) &&
          horarios.length === 2 &&
          new Set(horarios).size === 2 &&
          horarios.includes("09:00") &&
          horarios.includes("14:00")
        );
      });

    return [
      {
        identificacao: "solicitacao-consultar-disponibilidade",
        classificacao: ferramentaCorreta ? "aprovado" : "reprovado",
        justificativa: ferramentaCorreta
          ? "Foi solicitada consultarDisponibilidade."
          : "Não houve solicitação válida de consultarDisponibilidade.",
      },
      {
        identificacao: "argumentos-ana-data-correta",
        classificacao: argumentosAnaCorretos ? "aprovado" : "reprovado",
        justificativa: argumentosAnaCorretos
          ? "As solicitações usaram ana e 2026-10-20."
          : "Alguma solicitação não usou os valores esperados.",
      },
      {
        identificacao: "resultado-horarios-exatos",
        classificacao: resultadosAnaCorretos ? "aprovado" : "reprovado",
        justificativa: resultadosAnaCorretos
          ? "As execuções retornaram exatamente 09:00 e 14:00, sem duplicações ou extras."
          : "Houve resultado ausente, horários incorretos, extras ou duplicados.",
      },
    ];
  }

  return [
    {
      identificacao: "solicitacao-consultar-disponibilidade",
      classificacao: ferramentaCorreta ? "aprovado" : "reprovado",
      justificativa: ferramentaCorreta
        ? "Foi solicitada consultarDisponibilidade."
        : "Não houve solicitação válida de consultarDisponibilidade.",
    },
    {
      identificacao: "argumentos-carlos-data-correta",
      classificacao: argumentosCorretos ? "aprovado" : "reprovado",
      justificativa: argumentosCorretos
        ? "As solicitações usaram carlos e 2026-10-20."
        : "Alguma solicitação não usou os valores esperados.",
    },
    {
      identificacao: "resultado-horarios-vazio",
      classificacao: resultadosVazios ? "aprovado" : "reprovado",
      justificativa: resultadosVazios
        ? "As execuções retornaram um array horarios vazio."
        : "Houve resultado ausente ou horarios não vazio.",
    },
  ];
}

async function salvarRegistro(
  caso: Caso,
  entrada: string,
  resultado: ResultadoDoHarnessGroq,
  criterios: CriterioAutomatico[],
  avaliacaoDoTexto: "pendente" | "nao_avaliada",
): Promise<void> {
  const resultadoAutomatico: Classificacao = criterios.every(
    (item) => item.classificacao === "aprovado",
  )
    ? "aprovado"
    : criterios.some((item) => item.classificacao === "nao_avaliado")
      ? "nao_avaliado"
      : "reprovado";
  const registro = {
    caso,
    executadoEm: new Date().toISOString(),
    resultado,
    criteriosAutomaticos: criterios,
    resultadoAutomatico,
    avaliacaoDoTexto,
    entrada,
  };
  const pasta = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../resultados-avaliacoes",
  );
  await mkdir(pasta, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const caminho = resolve(pasta, `${caso}-${timestamp}-${randomUUID()}.json`);
  await writeFile(caminho, JSON.stringify(registro, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  console.log("Evidência salva em:", caminho);
}

async function main(): Promise<void> {
  const caso = process.argv[2] as Caso | undefined;
  if (!caso || !(caso in casos)) {
    console.error(
      "Uso: npx tsx src/avaliar-caso.ts ana-sem-data|carlos-sem-horarios|ana-com-horarios|reserva-nao-disponivel",
    );
    process.exitCode = 1;
    return;
  }

  const entrada = casos[caso];
  const resultado = await executarHarnessGroq(entrada);
  console.dir(resultado, { depth: null });
  const terminou = concluida(resultado);
  const criterios = criteriosPara(caso, resultado);
  const avaliacaoDoTexto = terminou ? "pendente" : "nao_avaliada";

  for (const criterio of criterios) {
    console.log(
      `Critério automático — ${criterio.identificacao}: ${criterio.classificacao}`,
    );
    console.log(criterio.justificativa);
  }
  console.log("Avaliação do texto:", avaliacaoDoTexto);
  if (!terminou) {
    console.log("Motivo de encerramento:", resultado.motivoDeEncerramento);
    if (resultado.erro) console.log("Erro seguro:", resultado.erro);
  }

  try {
    await salvarRegistro(caso, entrada, resultado, criterios, avaliacaoDoTexto);
  } catch (erro) {
    console.error("Falha de persistência das evidências:", erro);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro: unknown) => {
    console.error("Falha de execução do avaliador:", erro);
    process.exitCode = 1;
  });
}
