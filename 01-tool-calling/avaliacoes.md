# Avaliações do assistente de disponibilidade

## Objetivo

Definir o comportamento esperado antes de executar cada pergunta.
Depois, comparar o resultado observado com essa expectativa.

O assistente possui apenas a ferramenta consultarDisponibilidade.
Ela recebe profissionalId e data e retorna uma lista de horários.
Não existem ferramentas para criar ou cancelar agendamentos.

## Caso 1 — Consulta completa

**Pergunta:**
Quais horários a profissional ana tem em 20 de outubro de 2026?

### Minha expectativa

- Deve chamar uma ferramenta? Qual?
  Resposta: deve chamar a ferramenta consultarDisponibilidade

- Quais argumentos deve enviar?
  Resposta: professionalId e data

- Sabendo que a função retorna 09:00 e 14:00, o que deve comunicar?
  Resposta: Os horários disponíveis para a profissional Ana são 09:00 e 14:00

- O que seria um comportamento incorreto?
  Resposta: Inventar horários, responder algo não relacionado a disponibilidade.

### Após executar

- Ferramenta solicitada e argumentos:
- Resultado retornado pela função:
- Resposta do modelo:
- Atendeu à expectativa? Por quê?

**Status:** pendente desta rodada.

---

## Caso 2 — Data ausente

**Pergunta:**
Quais horários a profissional ana tem disponíveis?

### Minha expectativa

- Há informação suficiente para executar a consulta? O que falta?
  Resposta: Falta a informação da data a ser agendado

- O que o modelo deve fazer antes de consultar?
  Resposta: volta com uma pergunta ao usuário solicitando a data

- O que seria um comportamento incorreto?
  Resposta: Responder com um horário ficticio

### Após executar

- Houve solicitação de ferramenta? Com quais argumentos?
  Não houve solicitação de ferramenta.

- Resposta do modelo:
  “Para consultar os horários disponíveis da Ana, por favor,
  informe para qual data (dia/mês/ano) você gostaria de
  verificar a disponibilidade.”

- Atendeu à expectativa? Por quê?
  Sim. Pediu a data ausente, não inventou uma data e não
  solicitou a consulta antes de obter essa informação.

**Status:** aprovado nesta execução manual com API real.

**Status:** pendente.

---

## Caso 3 — Consulta sem horários

**Pergunta:**
Quais horários o profissional carlos tem em 20 de outubro de 2026?

### Minha expectativa

- Deve chamar uma ferramenta? Com quais argumentos?
  Resposta: Sim chama a consultarDisponibilidade

- Sabendo que a função retorna uma lista vazia, o que deve comunicar?
  Resposta: O profissional Carlos não tem nenhum horário disponivel nessa data.

- A lista vazia permite concluir por que não há horários?
  Resposta: Acredito que sim se não a horários pode se concluir que o profissional não tem horário disponível nesse dia.

- O que seria um comportamento incorreto?
  Resposta: Responder qualquer outra coisa que não seja a não disponibilidade do profissional ou a opção de marca para outro dia.

### Após executar

- Resposta do modelo:
  “O profissional Carlos não possui horários disponíveis
  para o dia 20 de outubro de 2026.”

- Atendeu à expectativa? Por quê?
  Parcialmente. Não inventou horários nem justificativas,
  mas apresentou a ausência de horários como certeza,
  em vez de descrever o resultado da consulta.

**Status:** ajuste necessário na formulação da resposta.

### Ajuste após a primeira avaliação

Adicionada uma instrução para tratar a lista vazia como ausência
de horários encontrados, sem inferir cadastro ou motivo.

Validação do novo comportamento:
Pendente de execução com API real.
---

## Caso 4 — Pergunta sobre capacidades

**Pergunta:**
O que você consegue fazer?

### Minha expectativa

- Precisa chamar uma ferramenta para responder?
  Resposta: Não precisa

- Quais capacidades deve explicar ao usuário?
  Resposta: a capacidade de consultar disponibilidade dos usuários

- Pode prometer criar ou cancelar agendamentos? Por quê?
  Resposta: Não se deve prometer, primeiro que não temos uma ferramenta dessa disponível

- O que seria um comportamento incorreto?
  Resposta: Falar sobre funções que ele não possui

### Após executar

- Houve solicitação de ferramenta? Qual?
- Resposta do modelo:
- Atendeu à expectativa? Por quê?

**Status:** bloqueado por limite diário da API.

Resultado observado:
HTTP 429 — limite de 20 requisições por dia no Free Tier.
Nenhuma resposta do modelo disponível para avaliação.