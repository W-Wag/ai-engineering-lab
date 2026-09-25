export type ConsultaDisponibilidade = {
  profissionalId: string;
  data: string;
};

export type Disponibilidade = {
  horarios: string[];
};

export function consultarDisponibilidade(
  consulta: ConsultaDisponibilidade,
): Disponibilidade {
  if (consulta.profissionalId === "erro-teste") {
    throw new Error("Serviço de disponibilidade indisponível.");
  }

  if (consulta.profissionalId === "ana" && consulta.data === "2026-10-20") {
    return { horarios: ["09:00", "14:00"] };
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
