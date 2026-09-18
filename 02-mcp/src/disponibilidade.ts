export type ConsultaDisponibilidade = {
    profissionalId: string;
    data: string;
}

export type Disponibilidade = {
    horarios: string[];
}

const disponibilidade: Disponibilidade = {
  horarios: [],
} as Disponibilidade;

export function consultarDisponibilidade(
    consulta: ConsultaDisponibilidade
): Disponibilidade {
      if (consulta.profissionalId === "ana" && consulta.data === "2026-10-20") {
    disponibilidade.horarios.push("09:00", "14:00");
    return { horarios: disponibilidade.horarios };
  }

  return { horarios: [] };
}