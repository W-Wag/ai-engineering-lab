# Estudo 02 — MCP

## Objetivo

Expor `consultarDisponibilidade` em um servidor MCP local e utilizá-la pelo MCP Inspector e por clientes TypeScript, sem modelo de IA.

O servidor usa Node.js, TypeScript em modo estrito, módulos ESM, o SDK v2 oficial do MCP e Zod.

## Conceitos aprendidos

### Tool calling

Em tool calling, o modelo solicita uma ferramenta com argumentos. A aplicação valida esses argumentos e executa a operação correspondente.

### MCP

MCP é um protocolo que padroniza como clientes descobrem ferramentas, conhecem seus argumentos, solicitam execuções e recebem resultados. Ele pode ser usado entre sistemas internos ou externos.

MCP e tool calling podem trabalhar juntos: um modelo pode decidir chamar uma ferramenta exposta por um servidor MCP. Neste estudo, o cliente MCP chama a ferramenta diretamente, sem modelo.

### Cliente MCP

O cliente MCP envia solicitações e recebe respostas do servidor. A comparação com Axios ajuda a entender esse papel: ambos enviam solicitações e recebem respostas, mas são protocolos e abstrações diferentes. Axios é uma biblioteca HTTP; MCP define uma comunicação voltada à descoberta e execução de capacidades.

### Servidor MCP

O servidor MCP disponibiliza ferramentas e executa as funções registradas. Ele recebe uma chamada, encaminha os argumentos para a função e devolve o resultado no formato do protocolo.

A aplicação coordena a interação com o modelo e com o cliente MCP. Neste estudo, não há modelo: os clientes TypeScript enviam diretamente as solicitações ao servidor.

## Quando usar

- **Endpoint HTTP:** consultar horários em uma interface convencional, como uma aplicação web ou mobile.
- **Tool calling direto:** permitir que um assistente solicite operações conhecidas pela própria aplicação.
- **MCP:** disponibilizar capacidades para diferentes clientes compatíveis por meio de um contrato comum.

MCP não substitui necessariamente tool calling. Um modelo pode usar tool calling para decidir uma operação e, por trás dessa operação, um cliente pode chamar uma ferramenta MCP.

## Implementação

### Arquivos

- `src/server.ts`: cria o servidor MCP, registra a ferramenta e inicia o transporte `stdio`.
- `src/disponibilidade.ts`: contém os tipos e a função fictícia `consultarDisponibilidade`.
- `src/client.ts`: conecta por stdio, lista ferramentas, chama `consultarDisponibilidade`, extrai o resultado e fecha a conexão.
- `src/assistente-simulado.ts`: representa uma solicitação que futuramente poderia vir de um modelo e verifica se a ferramenta está disponível antes de chamar `callTool`.
- `package.json`: define o projeto ESM, os scripts e as dependências.
- `tsconfig.json`: configura TypeScript estrito, módulos Node ESM e verificação sem emissão.

### Dependências

- `@modelcontextprotocol/server` e `@modelcontextprotocol/client`: SDK v2 oficial do MCP.
- `zod`: define o esquema dos argumentos da ferramenta.
- `tsx`: executa arquivos TypeScript.
- `typescript`: verifica os tipos.
- `@types/node`: tipos das APIs do Node.js.

### Cliente MCP e solicitação simulada

`client.ts` usa o SDK MCP para:

1. `connect`: conectar ao servidor pelo transporte stdio;
2. `listTools`: descobrir as ferramentas disponíveis;
3. `callTool`: solicitar `consultarDisponibilidade` com `profissionalId` e `data`;
4. `close`: encerrar a conexão.

O `StdioClientTransport` inicia seu próprio processo servidor usando o executável atual do Node, `--import tsx` e `src/server.ts`. Portanto, executar o cliente já inicia uma instância própria do servidor.

O cliente usa o SDK para toda essa comunicação; o protocolo MCP não foi implementado manualmente. A comparação com Axios ajuda a entender o papel do cliente — enviar solicitações e receber respostas —, mas MCP e HTTP/Axios são protocolos e abstrações diferentes.

Em `assistente-simulado.ts`, `solicitacaoDoModelo` é um objeto com `nome` e `argumentos`. Ele representa uma solicitação que futuramente poderia vir de um modelo. Atualmente, nenhum modelo participa dessa execução.

Antes de chamar `callTool`, a aplicação verifica se `solicitacaoDoModelo.nome` aparece na listagem retornada por `listTools`. Se não aparecer, informa `Ferramenta não disponível` e retorna sem chamar a ferramenta.

### Registro, esquema e transporte

`server.ts` cria um `McpServer` e registra `consultarDisponibilidade` com `registerTool`. O `inputSchema` usa Zod e declara:

- `profissionalId` como string;
- `data` como string descrita no formato `YYYY-MM-DD`.

O SDK valida os argumentos conforme esse esquema antes de chamar o handler. A função de disponibilidade, por sua vez, consulta apenas os dados fictícios definidos no projeto.

`serveStdio(criarServidor)` conecta o servidor à entrada e à saída padrão. Como `stdout` é reservado para o protocolo MCP, logs do servidor devem usar `console.error`, e não `console.log`; um log no `stdout` pode corromper as mensagens JSON-RPC.

### Validação e tratamento de erros

O servidor valida os argumentos com base no `inputSchema` de Zod. Os tipos TypeScript ajudam durante o desenvolvimento, mas não substituem a validação de dados externos que chegam pelo protocolo.

No assistente simulado, `resultado.isError === true` não valida novamente os argumentos. Essa verificação trata a falha informada pelo servidor. O código percorre `resultado.content` e exibe os blocos do tipo `text` com a mensagem de erro.

Uma resposta com `isError: true` é diferente de uma exceção lançada por `connect`, `listTools` ou `callTool`. A resposta com erro é tratada no fluxo normal do `try`; uma exceção interrompe esse fluxo e é capturada pelo `catch` externo.

O `return` encerra a execução de `main` naquele ponto. Ele é usado quando a ferramenta não está disponível e quando o servidor informa uma falha, evitando chamar ou processar mais etapas. O `finally` executa `cliente.close()` mesmo quando ocorre retorno ou exceção, garantindo o encerramento da conexão.

Esses são os comportamentos realmente implementados. O código não converte automaticamente a mensagem textual de erro em uma nova pergunta ao usuário e não envolve o resultado em uma camada adicional de validação no cliente.

### Formato do resultado

A resposta MCP contém blocos em `content`. O cliente extrai o primeiro bloco cujo `type` é `"text"` usando `find` e acessa seu campo `text`.

Neste projeto, o texto pode ser:

```text
{"horarios":["09:00","14:00"]}
```

Esse valor é uma string JSON, não um objeto JavaScript já interpretado. O código atual apenas extrai e imprime o texto; não chama `JSON.parse` nele.

## Como executar

Na pasta `02-mcp`, instale as dependências:

```bash
npm install
```

Verifique os tipos:

```bash
npm run typecheck
```

Inicie o servidor diretamente:

```bash
npm start
```

Um servidor stdio aguarda mensagens de um cliente. Para testá-lo com o MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx tsx src/server.ts
```

No Inspector, conecte ao servidor, abra a aba de ferramentas, selecione `consultarDisponibilidade` e envie os argumentos.

Execute o cliente MCP com:

```bash
npx tsx src/client.ts
```

Execute a solicitação simulada com:

```bash
npx tsx src/assistente-simulado.ts
```

Os clientes iniciam seus próprios processos servidor stdio. Não é necessário iniciar outro servidor manualmente antes de executar `client.ts` ou `assistente-simulado.ts`.

## Resultados observados

Conforme testes manuais locais relatados pelo usuário:

- Uma consulta válida da Ana retorna `09:00` e `14:00`.
- Para uma ferramenta desconhecida, a aplicação informa `Ferramenta não disponível` antes de chamar `callTool`.
- Com os argumentos sem `data`, o servidor retorna erro de validação com `isError: true`.
- O cliente identifica essa falha e exibe a mensagem de erro.
- Restaurando a data, a consulta volta a apresentar os horários.

Esses são testes locais via MCP, não mocks e não chamadas reais a modelos. Também não são testes automatizados nem foram executados por este documento.

## Limitações e próximos passos

- Os dados são fictícios e não há banco de dados.
- A ferramenta apenas consulta disponibilidade; não cria nem cancela agendamentos.
- Uma lista vazia não distingue profissional inexistente de ausência de horários.
- A integração entre um modelo e um cliente MCP ainda não foi implementada.
- As avaliações pendentes do Gemini pertencem ao estudo `01-tool-calling`.

### Próxima etapa

Integrar o modelo ao cliente MCP:

```text
solicitação do modelo → execução pelo MCP → envio do resultado ou erro ao modelo → resposta ao usuário
```

Futuramente, o modelo poderá transformar um erro como `data ausente` em uma pergunta de esclarecimento. Esse comportamento ainda não está implementado nem validado neste estudo.
