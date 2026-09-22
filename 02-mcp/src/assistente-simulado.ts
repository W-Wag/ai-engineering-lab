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

  const solicitacaoDoModelo = {
    nome: "consultarDisponibilidade",
    argumentos: {
      profissionalId: "ana",

     
    },
  };

  try {
    await cliente.connect(transporte);

    console.log("Servidor conectado:", cliente.getServerVersion());

    const ferramentas = await cliente.listTools();

    console.log(
      "Ferramentas disponíveis",
      ferramentas.tools.map((ferramenta) => ferramenta.name),
    );

    const ferramentaExiste = ferramentas.tools.some(
      (ferramenta) => ferramenta.name === solicitacaoDoModelo.nome,
    );


    if (!ferramentaExiste) {
      console.log("Ferramenta não disponível");
      return;
    }

    const resultado = await cliente.callTool({
      name: solicitacaoDoModelo.nome,
      arguments: solicitacaoDoModelo.argumentos,
    });

    if (resultado.isError === true) {
      console.error("Falha na execução da ferramenta")

      for (const bloco of resultado.content) {
        if (bloco.type === "text") {
          console.error(bloco.text)
        }
      }

      return
    }

    const textoResultado = resultado.content.find(
      (value) => value.type === "text",
    )?.text;
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
