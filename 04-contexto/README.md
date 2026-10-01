# 04-contexto

## Objetivo

Manter a continuidade de uma conversa enviando o histórico acumulado entre as rodadas do modelo.

## Fluxo observado pelo aluno

Esta execução foi relatada pelo aluno e usou a API da Groq:

1. O usuário perguntou pelos horários da Ana sem informar a data.
2. O modelo pediu a data.
3. O usuário informou `20 de outubro de 2026`.
4. O modelo solicitou `consultarDisponibilidade`.
5. A ferramenta retornou `09:00` e `14:00`.
6. O resultado foi incorporado ao histórico.
7. O modelo respondeu com Ana, a data correta e os dois horários.

## Responsabilidades

- `src/exercicio.ts` mantém e atualiza o histórico da conversa.
- `processarRodada(mensagens)` recebe as mensagens e retorna as novas mensagens produzidas.
- O histórico reúne mensagens com os papéis `system`, `user`, `assistant` e `tool`.
- A rodada seguinte recebe o histórico acumulado, incluindo o resultado da ferramenta.

Guardar o histórico em uma variável não o torna acessível ao modelo. A aplicação precisa enviá-lo na chamada à API. Enviar somente `20 de outubro de 2026` não transmite ao modelo o pedido anterior sobre Ana.

## Como executar

Na pasta `04-contexto`:

```bash
npm install
npm run typecheck
npm start
```

O comando `start` executa `tsx src/exercicio.ts` e utiliza a API da Groq. A integração usa o modelo `openai/gpt-oss-20b`, timeout de 30 segundos e `maxRetries: 0`, conforme o código atual.

## Investigação de históricos separados

O arquivo `src/investigacao-historicos.ts` investiga por que mensagens de duas conversas se misturavam:

- conversa A: consulta sobre Ana;
- conversa B: consulta sobre Carlos.

A hipótese inicial do aluno era que as conversas poderiam executar simultaneamente e que respostas chegariam fora de ordem. A investigação mostrou processamento sequencial, descartando essa hipótese como causa do defeito observado.

A causa encontrada foi o compartilhamento da mesma referência de array. Adicionar mensagens a uma conversa alterava o histórico visto pela outra. Duas variáveis apontando para o mesmo array não criam históricos independentes.

A correção criou dois arrays independentes, `historicosA` e `historicosB`, cada um iniciado com sua própria mensagem `system` e enviado separadamente a `processarConversa`.

O aluno relatou que o histórico A continha as instruções, a pergunta sobre Ana, o pedido de data e a data informada. O histórico B continha as instruções, a pergunta sobre Carlos, o pedido de data e a data informada. Nenhuma mensagem de uma conversa apareceu na outra.

O modo de execução dessa investigação não foi informado. A existência de um modo simulado ou de um modo com API no código não comprova qual foi executado.

## Conclusão do módulo

Os exercícios introdutórios trabalharam:

- preservar o histórico entre rodadas;
- enviar o contexto necessário ao modelo;
- separar os históricos de conversas distintas;
- distinguir conteúdo igual de referência compartilhada.

Persistência, resumo de contexto e outras estratégias avançadas não foram implementados nesta etapa. A investigação foi documentada como uma conclusão do módulo, sem novas execuções ou chamadas à API.
