type ConsultaDisponibilidade = {
  profissionalId: string;
  data: string;
};

type Disponibilidade = {
  horarios: string[];
};

type Solicitacao = {
  nome: string;
  argumentos: unknown;
};

const disponibilidade: Disponibilidade = {
  horarios: [],
} as Disponibilidade;

type ResultadoInterpretacao =
  | { sucesso: true; dados: unknown }
  | { sucesso: false; erro: string };


function interpretarArgumentos(
  argumentos: unknown
): ResultadoInterpretacao {
  if (typeof argumentos !== "string") {
    return {
      sucesso: false,
      erro: "Os argumentos devem ser um texto JSON",
    };
  }

  try {
    const dados: unknown = JSON.parse(argumentos);

    return { sucesso: true, dados };
  } catch {
    return { sucesso: false, erro: "JSON inválido" };
  }
}

export function consultarDisponibilidade(
  consulta: ConsultaDisponibilidade,
): Disponibilidade {
  if (consulta.profissionalId === "ana" && consulta.data === "2026-10-20") {
    disponibilidade.horarios.push("09:00", "14:00");
    return { horarios: disponibilidade.horarios };
  }

  return { horarios: [] };
}

export function eConsultaValida(valor: unknown): valor is ConsultaDisponibilidade {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    return false;
  }

  const objeto = valor as Record<string, unknown>;

  return (
    typeof objeto.profissionalId === "string" && typeof objeto.data === "string"
  );
}

const solicitacao: Solicitacao = {
  nome: "consultarDisponibilidade",
  argumentos: 'null',
};

function executarSolicitacao(solicitacao: Solicitacao) {
  if (solicitacao.nome !== "consultarDisponibilidade")
    return "Ferramenta não encontrada";

  const argumentosInterpretados = interpretarArgumentos(solicitacao.argumentos);

  if (argumentosInterpretados.sucesso === false) {
    return argumentosInterpretados.erro
  }

  if (eConsultaValida(argumentosInterpretados.dados)) {
    return consultarDisponibilidade(argumentosInterpretados.dados)
  }

  return "Argumentos Inválidos"
}


const resultado = executarSolicitacao(solicitacao)
console.log(resultado)

// const ana = { profissionalId: "ana", data: "2026-10-10" };
// const carlos = { profissionalId: "carlos", data: "2026-10-20" };

// const solicitacao = {
//   nome: "consultarDisponibilidade",
//   argumentos: {
//     profissionalId: "ana",
//     // A data não foi informada.
//   },
// };

// const resultadoTrue = '{"profissionalId":"ana","data":"2026-10-20"}'
// const resultadoSemData= '{"profissionalId":"ana"}'
// const resultadoDataNumber = '{"profissionalId":"ana","data":123}'

// const textoRecebido = resultadoDataNumber;

// const argumentos: unknown = JSON.parse(textoRecebido);

// console.log(eConsultaValida(argumentos))

// if (eConsultaValida(argumentos)) {
//   const resultado = consultarDisponibilidade(argumentos);
//   console.log(resultado)
// } else {
//   console.log("Dados mal formatados!")
// }

// if (solicitacao.nome === "consultarDisponibilidade") {
//   const resultado = consultarDisponibilidade(solicitacao.argumentos)
//   console.log(resultado);
// } else {
//   console.log("Ferramenta não encontrada")
// }
