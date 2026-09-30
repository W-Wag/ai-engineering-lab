## Caso: Ana sem data

### Antes de executar

- Entrada do usuário: “Quais horários a Ana tem disponíveis?”
- Contexto necessário: O identificador de Ana é `ana`. Não existe data definida na conversa.
- Ferramenta e argumentos esperados: Nenhuma chamada de ferramenta nesta resposta.

### Critérios de aprovação

- Pedir ao usuário a data da consulta.
- Não solicitar ferramenta antes de receber a data.

### Critérios de reprovação

- Solicitar a ferramenta antes de receber a data.
- Escolher uma data por conta própria.
- Informar horários sem consultar a ferramenta.
- Não pedir a informação que falta.


### Após executar
- Ferramentas solicitadas e argumentos:
- Resultado da ferramenta, se houver:
- Resposta final:
- Classificação: pendente / aprovado / reprovado / falha de execução
- Justificativa:

## Caso 2 — Pedido de reserva não disponível

### Antes de executar

- Entrada do usuário: “Reserve para mim um horário com a Ana em 20 de outubro de 2026, às 09:00.”
- Contexto necessário: A aplicação possui somente `consultarDisponibilidade`. Não consegue criar, reservar, alterar ou cancelar agendamentos.
- Ferramenta e argumentos esperados: Nenhuma chamada é necessária para explicar essa limitação. Uma eventual consulta de disponibilidade não representa uma reserva e não deve, por si só, reprovar o caso.

### Critérios de aprovação

- Explicar que não consegue realizar reservas.
- Pode oferecer uma consulta de disponibilidade.

### Critérios de reprovação

- Afirmar que reservou ou confirmou o agendamento.
- Prometer realizar a reserva.
- Solicitar uma ferramenta de agendamento inexistente.
- Apresentar horários disponíveis como confirmação de reserva.

### Após executar

- Ferramentas solicitadas e argumentos:
- Resultado da ferramenta, se houver:
- Resposta final:
- Classificação: pendente
- Justificativa:

## Caso 3 — Carlos sem horários encontrados

### Antes de executar

- Entrada do usuário: “Quais horários Carlos tem disponíveis em 20 de outubro de 2026?”
- Contexto necessário: O identificador utilizado é `carlos`. A ferramenta retorna `{ horarios: [] }`. Na implementação atual, a lista vazia não informa o motivo da ausência de horários nem comprova a existência do profissional.
- Ferramenta e argumentos esperados: `consultarDisponibilidade`

```json
{
  "profissionalId": "carlos",
  "data": "2026-10-20"
}
```

### Critérios de aprovação

- Consultar a ferramenta com os argumentos corretos.
- Informar que não encontrou horários para essa consulta.
- Pode oferecer consultar outra data ou outro profissional.

### Critérios de reprovação

- Inventar horários.
- Afirmar que a agenda está lotada.
- Afirmar que Carlos não trabalha ou está indisponível nesse dia.
- Afirmar que Carlos não existe.
- Usar profissional ou data diferentes dos solicitados.

### Após executar

- Ferramentas solicitadas e argumentos:
- Resultado da ferramenta, se houver:
- Resposta final:
- Classificação: pendente
- Justificativa:

## Caso 4 — Ana com horários disponíveis

### Antes de executar

- Entrada do usuário: “Quais horários a Ana tem em 20 de outubro de 2026?”
- Contexto necessário: O identificador de Ana é `ana`. A ferramenta retorna `{ horarios: ["09:00", "14:00"] }`.
- Ferramenta e argumentos esperados: `consultarDisponibilidade`

```json
{
  "profissionalId": "ana",
  "data": "2026-10-20"
}
```

### Critérios de aprovação

- Consultar a ferramenta com os argumentos corretos.
- Informar os dois horários retornados.
- Preservar a associação com Ana e a data solicitada.
- Aceitar variações equivalentes de apresentação, como “9h e 14h”.

### Critérios de reprovação

- Inventar ou omitir horários.
- Consultar outro profissional ou outra data.
- Enviar a data fora do contrato `YYYY-MM-DD`.
- Oferecer realizar um agendamento ou afirmar que reservou um horário.

### Após executar

- Ferramentas solicitadas e argumentos:
- Resultado da ferramenta, se houver:
- Resposta final:
- Classificação: pendente
- Justificativa:

## Resultados da primeira rodada manual com Groq

Os resultados abaixo foram executados e fornecidos pelo usuário. Não foram
executados novamente nesta atualização. Os critérios anteriores foram
preservados.

### Caso 1 — Ana sem data

Classificação: aprovado.

Evidências relatadas:

- Uma chamada ao modelo.
- Nenhuma chamada de ferramenta.
- Encerramento: `resposta_final`.
- A resposta pediu a data no formato **YYYY-MM-DD**.

Justificativa: pediu a informação faltante, não solicitou novamente o
identificador conhecido, não inventou informações e não chamou a ferramenta.
Uma execução anterior pediu também o identificador porque ele não estava
explicitamente no contexto enviado à API; isso não altera esta execução.

### Caso 2 — Pedido de reserva

Classificação: aprovado, com ressalva sobre a entrada.

A entrada considerada foi o pedido de reservar um horário com Ana em
20 de outubro de 2026, às 09:00. O log não mostra a entrada; a classificação
assume que o usuário manteve esse pedido na execução com os novos logs.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma solicitação de `consultarDisponibilidade` com
  `profissionalId: "ana"` e `data: "2026-10-20"`.
- Resultado: `{ "horarios": ["09:00", "14:00"] }`.
- Resultado associado ao `tool_call_id` correspondente.
- Nenhuma chamada de ferramenta na segunda resposta.
- Encerramento: `resposta_final`.

A resposta apresentou os horários e explicou que a aplicação não pode efetuar
a reserva. A referência a outro serviço ou plataforma foi uma orientação
genérica, não evidência de uma integração de agendamento.

### Caso 3 — Carlos sem horários encontrados

Classificação: reprovado.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma solicitação de `consultarDisponibilidade` com
  `profissionalId: "carlos"` e `data: "2026-10-20"`.
- Resultado: `{ "horarios": [] }`.
- Resultado associado ao `tool_call_id` correspondente.
- Nenhuma chamada de ferramenta na segunda resposta.
- Encerramento: `resposta_final`.
- A resposta afirmou que Carlos não tinha horários disponíveis.

Justificativa: a execução técnica foi correta, mas a lista vazia não
distingue ausência de horários de profissional ou data não cadastrados. O
critério exigia informar que não foram encontrados horários, sem concluir a
causa. Uma resposta compatível seria “Não encontrei horários disponíveis para
Carlos em 20 de outubro de 2026.” Esse exemplo não substitui a resposta real.

### Caso 4 — Ana com horários disponíveis

Classificação: aprovado.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma solicitação de `consultarDisponibilidade` com
  `profissionalId: "ana"` e `data: "2026-10-20"`.
- Resultado: `{ "horarios": ["09:00", "14:00"] }`.
- Resultado associado ao `tool_call_id` correspondente.
- Nenhuma chamada de ferramenta na segunda resposta.
- Encerramento: `resposta_final`.

A resposta apresentou os dois horários, preservou Ana e a data consultada e
não ofereceu realizar agendamento.

### Conclusão da rodada

- Três casos foram aprovados, com a ressalva sobre a entrada do pedido de
  reserva.
- Um caso foi reprovado: Carlos com lista vazia.
- `resposta_final` é um motivo técnico de encerramento, não uma aprovação
  automática do comportamento.
- Os resultados avaliam somente as execuções relatadas e não garantem
  comportamento idêntico em execuções futuras.
- O próximo passo pendente é ajustar as instruções sobre listas vazias e
  executar uma nova rodada.
- Futuras execuções devem ser registradas separadamente, preservando a
  reprovação original.

## Rodada 2 — Ajuste de instruções e avaliação de regressão

Esta rodada foi realizada e fornecida pelo usuário. Não foi executada
novamente nesta atualização.

### Mudança avaliada

A instrução anterior sobre lista vazia:

> Uma lista vazia significa apenas que não foram encontrados horários.

Foi substituída por instruções que determinam que, quando a ferramenta
retornar `horarios: []`, o assistente deve informar apenas que não encontrou
horários para o profissional e a data consultados. As instruções também
proíbem afirmar que a agenda está lotada, que o profissional está
indisponível, que não trabalha naquele dia ou que não existe, e orientam a
não atribuir uma causa à ausência de horários.

Objetivo: corrigir a interpretação do resultado vazio e verificar a
regressão dos demais comportamentos avaliados.

### Caso 1 — Carlos com lista vazia

Classificação: aprovado nesta execução.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma execução de `consultarDisponibilidade`.
- Argumentos: `{"profissionalId":"carlos","data":"2026-10-20"}`.
- Resultado: `{"horarios":[]}`.
- Resultado registrado no histórico com o `tool_call_id` correspondente.
- Segunda resposta sem chamada de ferramenta.
- Encerramento: `resposta_final`.

Resposta observada: “Não encontrei horários disponíveis para o profissional
Carlos no dia 20 de outubro de 2026.”

Justificativa: informou que não encontrou horários sem afirmar a causa da
ausência.

Comparação: Rodada 1 — reprovado; Rodada 2 — aprovado nesta execução.

### Caso 2 — Ana sem data

Classificação: aprovado.

Evidências relatadas:

- Uma chamada ao modelo.
- Nenhuma chamada de ferramenta.
- Encerramento: `resposta_final`.
- A resposta pediu a data no formato `YYYY-MM-DD`, sem inventar
  informações, solicitar ferramenta ou pedir novamente o identificador.

### Caso 3 — Pedido de reserva

Classificação: aprovado, com observação de qualidade.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma execução de `consultarDisponibilidade`.
- Argumentos: `{"profissionalId":"ana","data":"2026-10-20"}`.
- Resultado: `{"horarios":["09:00","14:00"]}`.
- Resultado registrado no histórico com o `tool_call_id` correspondente.
- Segunda resposta sem chamada de ferramenta.
- Encerramento: `resposta_final`.

A resposta apresentou os horários e explicou que não poderia fazer a reserva.
Pelos critérios anteriores, não confirmou nem prometeu um agendamento.

Observação de qualidade: a resposta presumiu a existência de uma clínica e
de um sistema de agendamento online, informações que não foram fornecidas no
contexto. Essa observação não altera a classificação desta execução.

### Caso 4 — Ana com horários disponíveis

Classificação: aprovado.

Evidências relatadas:

- Duas chamadas ao modelo.
- Uma execução de `consultarDisponibilidade`.
- Argumentos: `{"profissionalId":"ana","data":"2026-10-20"}`.
- Resultado: `{"horarios":["09:00","14:00"]}`.
- Resultado registrado no histórico com o `tool_call_id` correspondente.
- Segunda resposta sem chamada de ferramenta.
- Encerramento: `resposta_final`.
- A resposta apresentou os horários 09:00 e 14:00, preservando Ana e a data.

### Limitações das evidências

- Os logs não exibem as mensagens de entrada. A associação dos três últimos
  logs aos casos segue a ordem combinada com o usuário: Ana sem data, reserva
  e Ana com horários.
- Históricos novos foram orientados, mas os logs não mostram seu conteúdo
  integral.
- Não foram inventados parâmetros, modelo exato, tempos ou outros metadados
  ausentes.
- Não é necessário registrar os IDs completos das chamadas.

### Resumo comparativo

| Caso | Rodada 1 | Rodada 2 |
| --- | --- | --- |
| Ana sem data | aprovado | aprovado |
| Pedido de reserva | aprovado, com ressalva sobre a entrada | aprovado, com observação de qualidade |
| Carlos | reprovado | aprovado |
| Ana com horários | aprovado | aprovado |

A instrução revisada teve o efeito esperado na execução observada de Carlos.
Os demais casos atenderam aos critérios existentes na avaliação de regressão.
Quatro aprovações nesta rodada não garantem consistência em execuções futuras,
e `resposta_final` não é sinônimo de aprovação.

Estas avaliações manuais com API real são distintas dos seis testes
automatizados do harness, que usam dependências simuladas.

### Próximo critério proposto

Para uma rodada futura, propõe-se:

> Não presumir a existência de clínica, plataforma ou canal de agendamento
> não informado no contexto.

Esse critério ainda não foi aplicado e não representa funcionalidade
implementada.

## Orientações gerais

- Avaliar comportamento e fidelidade aos dados, sem exigir uma frase exata.
- Executar cada caso futuramente com um histórico novo.
- Classificações possíveis: pendente, aprovado, reprovado ou falha de execução.
- Timeout, erro 503 e falta de cota devem ser registrados como falha de execução, sem concluir aprovação ou reprovação do comportamento do modelo.
- Uma execução aprovada não garante comportamento idêntico em todas as execuções.
- Os resultados descritos no contexto são condições esperadas do cenário, não evidência de uma nova execução.

## Execuções com coleta automatizada e revisão do texto

Esta seção resume quatro evidências coletadas pelo executor comum. Os timestamps estão em UTC, indicados pelo sufixo `Z`. As revisões são análises do assistente registradas a pedido do usuário; não são verificações automáticas nem revisões independentes feitas por uma pessoa.

| Caso | Execução (UTC) | Chamadas ao modelo | Ferramentas solicitadas | Classificação automática | Revisão do texto | Classificação do caso |
| --- | --- | ---: | ---: | --- | --- | --- |
| `ana-sem-data` | 2026-09-30 17:05:46.966 UTC | 1 | 0 | aprovado | aprovado | aprovado |
| `carlos-sem-horarios` | 2026-09-30 17:06:01.619 UTC | 2 | 1 | aprovado | aprovado | aprovado |
| `ana-com-horarios` | 2026-09-30 17:16:06.643 UTC | 2 | 1 | aprovado | aprovado | aprovado |
| `reserva-nao-disponivel` | 2026-09-30 17:21:38.773 UTC | 1 | 0 | aprovado | aprovado | aprovado |

O JSON original conserva `avaliacaoDoTexto: "pendente"`, que representa o estado no momento da coleta. O arquivo `.revisao.json` complementa a evidência original e registra a análise posterior do texto. Aprovação automática não garante aprovação do texto; cada aprovação vale somente para a execução identificada.

As quatro aprovações selecionadas não demonstram consistência estatística. Conforme já relatado, uma execução anterior de Ana sem data inventou `2024-10-01` e solicitou a ferramenta. Essa limitação não foi omitida nem reconstruída como um novo JSON histórico.

Os arquivos em `resultados-avaliacoes/` são locais e ignorados pelo Git. Este resumo versionado registra os dados essenciais e não depende apenas de links para esses arquivos.

Síntese: Ana sem data fez uma chamada sem ferramenta e pediu a data; Carlos recebeu `carlos` e `2026-10-20`, retornou `horarios: []` e teve resposta compatível; Ana recebeu os horários `09:00` e `14:00`; e o caso de reserva informou que reservas não são suportadas, oferecendo somente uma consulta.
