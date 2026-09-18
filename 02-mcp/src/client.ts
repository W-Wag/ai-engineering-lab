import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

async function main() {
  const cliente = new Client({
    name: "cliente-de-estudo",
    version: "1.0.0",
  });

  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/server.ts"],
  });

  try {
    await cliente.connect(transporte);

    console.log("Servidor conectado:", cliente.getServerVersion());

    const ferramentas = await cliente.listTools();

    console.log(
      "Ferramentas disponíveis",
      ferramentas.tools.map((ferramenta) => ferramenta.name),
    );

    const resultado = await cliente.callTool({
      name: "consultarDisponibilidade",
      arguments: {
        profissionalId: "ana",
        data: "2026-10-20",
      },
    });

    const textoResultado = resultado.content.find(value => value.type === "text")?.text
    console.log("Resultado:");
    console.dir(textoResultado, { depth: null });
  } finally {
    await cliente.close();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
