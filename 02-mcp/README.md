# Estudo 02 — MCP

## Objetivo

Expor `consultarDisponibilidade` em um servidor MCP local e utilizá-la pelo MCP Inspector e por um cliente TypeScript, sem modelo de IA.

O servidor usa Node.js, TypeScript em modo estrito, módulos ESM, o SDK v2 oficial do MCP e Zod.

## Conceitos aprendidos

### Tool calling

Em tool calling, o modelo solicita uma ferramenta com argumentos. A aplicação valida esses argumentos e executa a operação correspondente.

### MCP

MCP é um protocolo que padroniza como clientes descobrem ferramentas, conhecem seus argumentos, solicitam execuções e recebem resultados. Ele pode ser usado entre sistemas internos ou externos.

MCP e tool calling podem trabalhar juntos: um modelo pode decidir chamar uma ferramenta exposta por um servidor MCP. Neste estudo, o cliente MCP chama a ferramenta diretamente, sem modelo.

### Cliente MCP

O cliente MCP envia solicitações e recebe respostas do servidor. A comparação com Axios ajuda a entender esse papel: ambos fazem solicitações e recebem respostas, mas são protocolos e abstrações diferentes. Axios é uma biblioteca HTTP; MCP define uma comunicação voltada à descoberta e execução de capacidades.

### Servidor MCP

O servidor MCP disponibiliza ferramentas e executa as funções registradas. Ele recebe uma chamada, encaminha os argumentos para a função e devolve o resultado no formato do protocolo.

A aplicação coordena a interação com o modelo e com o cliente MCP. Neste estudo, não há modelo: o cliente TypeScript envia diretamente a solicitação ao servidor.

## Quando usar

- **Endpoint HTTP:** consultar horários em uma interface convencional, como uma aplicação web ou mobile.
- **Tool calling direto:** permitir que um assistente solicite operações conhecidas pela própria aplicação.
- **MCP:** disponibilizar capacidades para diferentes clientes compatíveis por meio de um contrato comum.

MCP não substitui necessariamente tool calling. Um modelo pode usar tool calling para decidir uma operação e, por trás dessa operação, um cliente pode chamar uma ferramenta MCP.

## Implementação

### Arquivos

- `src/server.ts`: cria o servidor MCP, registra a ferramenta e inicia o transporte `stdio`.
- `src/disponibilidade.ts`: contém os tipos e a função fictícia `consultarDisponibilidade`.
- `src/client.ts`: cria um cliente MCP, inicia o servidor como processo filho, descobre a ferramenta, chama-a e extrai o resultado textual.
- `package.json`: define o projeto ESM, os scripts e as dependências.
- `tsconfig.json`: configura TypeScript estrito, módulos Node ESM e verificação sem emissão.

### Dependências

- `@modelcontextprotocol/server` e `@modelcontextprotocol/client`: SDK v2 oficial do MCP.
- `zod`: define o esquema dos argumentos da ferramenta.
- `tsx`: executa arquivos TypeScript.
- `typescript`: verifica os tipos.
- `@types/node`: tipos das APIs do Node.js.

### Registro e argumentos

`server.ts` cria um `McpServer` e registra `consultarDisponibilidade` com `registerTool`. O `inputSchema` usa Zod e declara:

- `profissionalId` como string;
- `data` como string descrita no formato `YYYY-MM-DD`.

O SDK usa esse esquema para descrever os argumentos da ferramenta e validar a entrada antes de chamar o handler. A função de disponibilidade, por sua vez, consulta apenas os dados fictícios definidos no projeto.

### Transporte stdio

`serveStdio(criarServidor)` conecta o servidor à entrada e à saída padrão. O cliente inicia o processo, envia mensagens pelo `stdin` e recebe respostas pelo `stdout`.

Como o `stdout` é reservado para o protocolo MCP, logs do servidor devem usar `console.error`, e não `console.log`. Um log no `stdout` pode corromper as mensagens JSON-RPC.

### Cliente MCP

O cliente segue este fluxo:

1. `connect`: conecta ao servidor pelo transporte stdio.
2. `listTools`: descobre as ferramentas disponíveis.
3. `callTool`: solicita `consultarDisponibilidade` com `profissionalId` e `data`.
4. `close`: encerra a conexão.

No `StdioClientTransport`, o cliente inicia seu próprio processo servidor usando o executável atual do Node, `--import tsx` e `src/server.ts`. Por isso, executar o cliente já inicia uma instância própria do servidor; não é necessário iniciar outra manualmente.

O servidor retorna `content` como uma lista de blocos. Neste projeto há um bloco de texto cujo conteúdo é uma string JSON, por exemplo:

```json
{"horarios":["09:00","14:00"]}
```

O cliente usa `find` para extrair o primeiro bloco cujo `type` é `"text"` e imprime seu campo `text`. Esse valor ainda é uma string JSON; o código atual não a converte novamente em objeto JavaScript.

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

Execute o cliente TypeScript com:

```bash
npx tsx src/client.ts
```

Esse cliente inicia seu próprio processo servidor stdio, conecta, executa `listTools`, chama a ferramenta e fecha a conexão.

## Resultados observados

Conforme execuções manuais relatadas pelo estudante:

- O Inspector conectou ao servidor e mostrou sua identificação.
- A ferramenta foi descoberta por meio de `tools/list`.
- A consulta da Ana por `tools/call` retornou `09:00` e `14:00`.
- O cliente TypeScript conectou, listou a ferramenta e realizou a consulta.
- O cliente extraiu o texto contendo os horários da resposta MCP.

Esses resultados são relatos de execuções manuais do estudante. Não são testes automatizados nem foram executados por este documento.

## Limitações e próximos passos

- Os dados são fictícios e não há banco de dados.
- A ferramenta apenas consulta disponibilidade; não cria nem cancela agendamentos.
- Uma lista vazia não distingue profissional inexistente de ausência de horários.
- A integração entre um modelo e um cliente MCP ainda não foi implementada.
- As avaliações pendentes do Gemini pertencem ao estudo `01-tool-calling`.
