# Estudo 02 — MCP

## Objetivo

Integrar um modelo hospedado na Groq a ferramentas descobertas e executadas por um cliente MCP conectado a um servidor local.

O servidor expõe `consultarDisponibilidade` por stdio. O cliente MCP descobre essa ferramenta, adapta sua descrição para o formato aceito pela Groq e coordena as chamadas ao modelo e ao servidor MCP.

## Conceitos anteriores

MCP padroniza como clientes descobrem ferramentas, conhecem seus argumentos, solicitam execuções e recebem resultados. Tool calling permite que um modelo solicite uma ferramenta com argumentos; a aplicação valida e executa a operação.

Neste estudo, o cliente MCP faz a ponte entre o modelo Groq e o servidor local. O cliente MCP não escolhe sozinho qual ferramenta usar: o modelo retorna `tool_calls`, e a aplicação decide como encaminhar cada chamada.

## Fluxo implementado

Em `src/assistente-groq.ts`, o fluxo atual é:

1. Conectar o cliente MCP ao servidor local por stdio.
2. Descobrir as ferramentas com `listTools`.
3. Adaptar `name`, `description` e `inputSchema` para o formato `tools` da Groq.
4. Enviar ao modelo Groq o pedido, as instruções e as ferramentas descobertas.
5. Receber `tool_calls` ou uma resposta textual direta.
6. Quando há `tool_calls`, interpretar os argumentos JSON e encaminhar a chamada pelo cliente MCP.
7. Acrescentar a mensagem do modelo e os resultados das ferramentas ao histórico, associando cada resultado ao respectivo `tool_call_id`.
8. Fazer uma segunda chamada à Groq para gerar a resposta ao usuário.
9. Fechar a conexão MCP no bloco `finally`.

A aplicação coordena o modelo e o cliente MCP. O servidor MCP valida os argumentos conforme seu `inputSchema` e executa a função registrada. A segunda chamada à Groq não recebe `tools`; ela recebe apenas o histórico atualizado com a mensagem do modelo e os resultados das ferramentas.

Este é um fluxo limitado, não um loop autônomo completo: o código faz uma chamada inicial, processa os `tool_calls` retornados e faz uma única chamada final. Não há um ciclo que continue tratando novas solicitações de ferramenta geradas pela resposta final.

## Arquivos e dependências

- `src/server.ts`: registra `consultarDisponibilidade` no servidor MCP e inicia o transporte stdio.
- `src/disponibilidade.ts`: contém os tipos e a função com dados fictícios.
- `src/client.ts`: cliente MCP básico que conecta, lista ferramentas, chama a ferramenta e fecha a conexão.
- `src/assistente-simulado.ts`: simula uma solicitação com nome e argumentos e trata respostas com `isError`.
- `src/assistente-groq.ts`: integra o modelo Groq ao cliente MCP.
- `package.json`: define o projeto ESM, scripts e dependências.
- `tsconfig.json`: configura TypeScript estrito e verificação sem emissão.

As dependências principais são `@modelcontextprotocol/client`, `@modelcontextprotocol/server`, `zod`, `groq-sdk`, `tsx` e `typescript`.

O programa Groq acessa `GROQ_API_KEY` por meio de `shared/env.ts`, que carrega o arquivo `.env` esperado na raiz de `ai-engineering-lab`. A documentação usa apenas este placeholder:

```env
GROQ_API_KEY=seu-placeholder-aqui
```

O arquivo real de credenciais não deve ser incluído na documentação nem versionado.

O modelo usado é:

```text
openai/gpt-oss-20b
```

O cliente Groq está configurado com timeout de `30_000` milissegundos e `maxRetries: 0`, ou seja, sem novas tentativas automáticas.

## Tratamento de falhas

O comportamento implementado diferencia estes casos:

- **Ferramenta desconhecida:** no fluxo Groq atual, o código ainda não faz uma verificação explícita do nome recebido contra a lista de ferramentas antes de `callTool`. Essa é uma lacuna da implementação.
- **JSON inválido:** `JSON.parse` é usado nos argumentos retornados pelo modelo. Se falhar, a exceção cai no `catch` externo e é impressa. O código não apresenta uma mensagem específica para JSON inválido.
- **Argumentos rejeitados pelo servidor:** o cliente encaminha o objeto ao MCP; a validação ocorre no servidor, conforme o schema Zod. A resposta pode indicar erro.
- **Resposta MCP com `isError`:** `assistente-groq.ts` não verifica `resultado.isError` separadamente. Ele serializa o resultado e o acrescenta ao histórico como resposta da ferramenta. O tratamento explícito de `isError` existe em `assistente-simulado.ts`.
- **Exceção de conexão ou API:** erros lançados pelo cliente MCP ou pela Groq são capturados pelo `catch`, que imprime o erro. O `finally` chama `await cliente.close()` para encerrar a conexão mesmo após falha.

O código não implementa uma política adicional de retry, não executa a ferramenta localmente fora do MCP e não converte automaticamente erros em pedidos de esclarecimento.

## Como executar

Na pasta `02-mcp`, instale as dependências:

```bash
npm install
```

Verifique os tipos:

```bash
npm run typecheck
```

Inicie o servidor MCP diretamente:

```bash
npm start
```

Teste o servidor pelo MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx tsx src/server.ts
```

Execute o cliente MCP básico:

```bash
npx tsx src/client.ts
```

Execute o assistente simulado:

```bash
npx tsx src/assistente-simulado.ts
```

Execute a integração Groq + MCP:

```bash
npx tsx src/assistente-groq.ts
```

Os clientes stdio iniciam seus próprios processos servidor. Não é necessário iniciar outro servidor manualmente antes de executar os clientes.

## Resultados desta etapa

Os testes manuais da integração Groq + MCP estão registrados em [avaliacoes.md](avaliacoes.md). Foram chamadas reais à Groq com o servidor MCP local, não mocks nem testes automatizados.

A integração técnica funcionou nas execuções relatadas: o cliente conectou, descobriu a ferramenta, encaminhou chamadas ao MCP, recebeu resultados, fez a chamada final ao modelo e encerrou com `cliente.close()` e `main()` concluídos.

As respostas ainda apresentam limitações de precisão. Instruções no prompt orientam o modelo, mas não garantem comportamento correto em todos os casos. Os resultados da Groq não validam os casos pendentes do Gemini no estudo `01-tool-calling`.

## Limitações e próximos passos

- Os dados são fictícios e não há banco de dados.
- Apenas consulta de disponibilidade foi implementada; criar e cancelar agendamentos não foram implementados.
- Uma lista vazia não distingue profissional inexistente de ausência de horários.
- O nome recebido pelo modelo ainda não é conferido explicitamente contra as ferramentas descobertas antes de `callTool`.
- A resposta MCP com `isError` ainda não recebe tratamento específico no fluxo Groq.
- O fluxo não é um loop autônomo completo.
- A integração entre modelo e cliente MCP foi concluída tecnicamente, mas os casos de avaliação do Gemini continuam pertencendo ao estudo 01.
