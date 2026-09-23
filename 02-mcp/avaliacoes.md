# Avaliações — Integração Groq + MCP

## Contexto

Os casos abaixo registram execuções manuais relatadas pelo usuário. Foram chamadas reais à Groq com o servidor MCP local. Não são mocks nem testes automatizados, e não foram executados por este documento.

## Caso 1 — Ana com data

**Pedido:** consultar os horários da profissional Ana em 20 de outubro de 2026.

- Ferramenta solicitada: `consultarDisponibilidade`.
- Argumentos: `profissionalId: "ana"` e `data: "2026-10-20"`.
- Retorno MCP: `horarios: ["09:00", "14:00"]`.
- A resposta final apresentou exatamente esses dois horários.
- **Avaliação:** aprovado nesta execução.

## Caso 2 — Data ausente

**Pedido:** consultar a disponibilidade da Ana sem informar a data.

- Não houve chamada de ferramenta.
- O modelo pediu a data para consultar a disponibilidade da Ana.
- **Avaliação:** aprovado nesta execução.

## Caso 3 — Carlos com data

**Pedido:** consultar os horários de Carlos em 20 de outubro de 2026.

- Argumentos: `profissionalId: "carlos"` e `data: "2026-10-20"`.
- Retorno MCP: `horarios: []`.
- Resposta observada: “Desculpe, mas não há horários disponíveis para o profissional Carlos em 20 de outubro de 2026.”
- **Avaliação:** parcial. A resposta não inventou horários nem justificativas, mas afirmou indisponibilidade em vez de dizer apenas que não encontrou horários. A implementação não distingue profissional inexistente de ausência de horários.

## Caso 4 — Capacidades

**Pedido:** perguntar o que o assistente consegue fazer.

- Não houve chamada de ferramenta.
- O modelo explicou que consulta disponibilidade usando profissional e data.
- Também acrescentou: “Se eu não conseguir encontrar o profissional ou a data, pedirei esclarecimentos.”
- **Avaliação:** parcial. Essa afirmação excede o contrato atual: a ferramenta não identifica separadamente profissional não encontrado e data não encontrada.

## Encerramento observado

Nos quatro testes, os logs mostraram:

- conclusão de `cliente.close()`;
- conclusão de `main()`;
- retorno ao prompt do terminal.

Esses logs confirmam, nas execuções relatadas, que a integração técnica entre Groq, cliente MCP e servidor local funcionou. Eles não transformam os testes em validações automatizadas e não alteram os resultados históricos do estudo Gemini.

## Limitações da avaliação

- Instruções no prompt ajudam a orientar o modelo, mas não garantem respostas corretas em todos os casos.
- Os resultados da Groq não validam os casos pendentes do Gemini em `01-tool-calling`.
- Criar e cancelar agendamentos não foram implementados.
- O sistema ainda não diferencia profissional inexistente de ausência de horários.
