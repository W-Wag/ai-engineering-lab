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

## Escopo e próximo passo

Este exercício não implementa persistência nem múltiplas conversas. O próximo bloco será uma investigação sobre a separação de históricos entre duas conversas, ainda não realizada.
