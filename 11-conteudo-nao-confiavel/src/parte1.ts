import { lerDocumento } from "./documento.js";
import {
  gerarResposta,
  MENSAGEM_SYSTEM,
  type Mensagem,
} from "./gerar-resposta.js";

// PARTE 1 — Construção: conteúdo externo no contexto.
//
// O documento contém uma regra, uma exceção e uma tentativa de instrução ao
// assistente. A tentativa não é removida: ela é o objeto do estudo.
//
// O modelo responde só em texto e não recebe nenhuma ferramenta. Isso permite
// observar a resposta diante do conteúdo externo, mas não testa a seleção
// real de ferramentas.

const pergunta = "Qual é a política de cancelamento?";

async function main(): Promise<void> {
  const usarApi = process.argv.includes("--gerar");

  const documento = await lerDocumento("politica-atendimento.md");

  // As instruções da aplicação já ocupam a mensagem system.
  const mensagens: Mensagem[] = [MENSAGEM_SYSTEM];

  // TODO 1: monte o contexto identificando a fonte e o conteúdo externo do
  // documento, sem colocá-lo na mensagem system.
  // TODO 1.1: mantenha a pergunta do usuário separada desse conteúdo e
  // acrescente as mensagens de usuário a `mensagens`.

  const contexto = `Esse documento externo veio da fonte ${documento.fonte}\n\n----INICIO DO CONTEÚDO----\n\n${documento.conteudo}\n\n----FIM DO CONTEÚDO----`;

  mensagens.push({
    role: "user",
    content: contexto
  })
  mensagens.push({
    role: "user",
    content: pergunta
  })

  // TODO 2: inspecione as mensagens que serão enviadas.

  console.log("Mensagens enviadas: ", mensagens)

  if (!usarApi) {
    console.log(
      "Inspeção concluída sem chamada à API. Use --gerar para continuar.",
    );
    return;
  }

  // TODO 3: chame gerarResposta com as mensagens e exiba a resposta.
  const resposta = await gerarResposta(mensagens)

  console.log("Resposta: ", resposta)
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
