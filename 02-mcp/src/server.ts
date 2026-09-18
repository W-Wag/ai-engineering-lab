import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { consultarDisponibilidade } from "./disponibilidade.js";

function criarServidor(): McpServer {
  const servidor = new McpServer({
    name: "disponibilidade-profissionais",
    version: "1.0.0",
  });

  servidor.registerTool(
    "consultarDisponibilidade",
    {
      description:
        "Consulta os horários disponíveis de um profissional em uma data.",
      inputSchema: z.object({
        profissionalId: z
          .string()
          .describe("Indentificador do profissional, por exemplo: ana"),
        data: z.string().describe("Data da consulta no formato YYYY-MM-DD"),
      }),
    },
    async (argumentos) => {
      const resultado = consultarDisponibilidade(argumentos);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultado),
          },
        ],
      };
    },
  );

  return servidor;
}

void serveStdio(criarServidor);
