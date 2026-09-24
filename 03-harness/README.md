# Estudo 03 — Harness simulado

## Objetivo

Construir um harness em TypeScript para estudar controle de execução,
registro de resultados, tentativas, erros e condições de parada.

Esta etapa é local e determinística: não utiliza API de IA nem MCP.

## Evolução do exercício

Inicialmente, o harness percorria um array fixo de respostas simuladas.
Depois, esse array foi substituído por `simularModelo`, que recebe o
histórico registrado pelo harness e decide o próximo passo:

- sem resultados, solicita `consultarDisponibilidade` para Carlos em
  `2026-10-20`;
- com uma consulta de Carlos que retorna lista vazia, solicita a mesma
  ferramenta para Ana;
- com horários, produz a resposta final usando os horários retornados;
- com lista vazia sem uma próxima consulta específica, informa que não
  encontrou horários.

O harness executa a função local, registra nome, argumentos e resultado,
e fornece esse estado à próxima chamada da simulação. Assim, a resposta
seguinte depende do que ocorreu na execução anterior.

O cenário ativo atualmente é:

```text
Carlos → lista vazia → Ana → horários encontrados → resposta final
```

## Condições de encerramento

O código usa estes motivos:

- `resposta_final`: a simulação produziu uma resposta e o ciclo terminou;
- `limite_atingido`: o número máximo de chamadas à simulação foi alcançado;
- `ferramenta_desconhecida`: a ferramenta solicitada não está disponível;
- `erro_ferramenta`: as tentativas de execução terminaram sem sucesso;
- `sem_resposta`: tratamento preservado de uma etapa anterior, embora a
  simulação atual sempre retorne uma resposta válida.

`resposta_final` indica o encerramento da resposta, mas não comprova que
seu conteúdo esteja correto. `limite_atingido` é um teto, não uma quantidade
obrigatória de chamadas.

## Falha versus consulta sem horários

`{ horarios: [] }` representa uma consulta que terminou normalmente, mas
não encontrou horários. Uma exceção significa que a consulta não concluiu
normalmente.

Um histórico vazio significa que nenhum resultado foi registrado; ele não
equivale a uma consulta válida cujo resultado contém uma lista vazia.
O log de sucesso aparece depois do retorno da função, dentro do `try`.

## Tentativas e espera

O código define a classe `ErroTemporario` e decide se deve repetir pela
classe do erro, não pela mensagem. Cada solicitação de ferramenta pode ter
duas tentativas totais: a original e uma repetição.

Foi adicionada a função assíncrona `esperar(ms)`. A espera configurada é de
1 segundo e ocorre somente depois de um erro temporário quando ainda há uma
tentativa disponível. Não há espera antes da primeira tentativa, depois de
um erro definitivo ou após a última tentativa permitida.

Os logs relatados pelo usuário confirmaram o acionamento da espera nos
caminhos esperados, mas não houve medição independente da duração.

Um erro definitivo encerra as tentativas imediatamente. Quando as tentativas
se esgotam, o harness termina com `erro_ferramenta`. Depois de um sucesso,
apenas um resultado é registrado e o ciclo principal continua.

## Continuação da tarefa e retry

Consultar Carlos e depois Ana é uma nova etapa da tarefa: os argumentos são
diferentes. Repetir a consulta de Carlos depois de uma falha temporária é um
retry da mesma operação.

O contador `tentativasDaConsulta` é reiniciado para cada nova solicitação,
mesmo quando o nome da ferramenta continua sendo
`consultarDisponibilidade`. Uma lista vazia é um resultado válido, não um
erro de execução.

Há dois limites distintos:

- `limiteDeChamadas` controla as chamadas à simulação do modelo;
- o limite usado pelo ciclo de tentativas controla as execuções da
  ferramenta para uma solicitação.

Por isso, uma chamada à simulação pode resultar em duas tentativas da
ferramenta.

## Controle dos ciclos

O `continue` do ciclo interno inicia a próxima tentativa. O `break` desse
ciclo encerra somente as tentativas da solicitação. Depois, o ciclo principal
verifica se ocorreu uma falha definitiva e também é encerrado quando
necessário.

Tentativas que lançam exceção não são registradas no histórico. Só o
resultado de uma execução bem-sucedida é adicionado a
`resultadosDasFerramentas`.

## Múltiplas consultas e histórico

O histórico guarda:

- o nome da ferramenta;
- os argumentos da solicitação;
- o resultado retornado.

Os argumentos permitem identificar a qual profissional e data cada resultado
pertence. No cenário atual, o histórico registra primeiro Carlos em
`2026-10-20` com `horarios: []` e depois Ana na mesma data com
`horarios: ["09:00", "14:00"]`.

`simularModelo` recebe esse histórico e toma decisões por regras programadas.
O harness coordena as chamadas à simulação, a execução da função, o registro
do estado, o tratamento de erros, as tentativas, a espera e as condições de
parada. Nenhuma dessas decisões é feita por uma IA real.

## Defeito corrigido: estado compartilhado

Em uma etapa anterior, `consultarDisponibilidade` adicionava horários com
`push` em um array compartilhado. Cada execução acumulava mais valores. O
retorno criava um objeto novo, mas reutilizava o mesmo array, fazendo com que
registros antigos também refletissem alterações posteriores.

A correção retorna um objeto novo com um array novo, como
`{ horarios: ["09:00", "14:00"] }`. Para outras consultas, retorna
`{ horarios: [] }`.

Guardar um objeto no histórico não cria automaticamente cópias independentes
dos objetos internos. Após a correção, cada um dos três registros do cenário
repetitivo continha somente `["09:00", "14:00"]`.

## Testes manuais relatados

As verificações abaixo foram execuções manuais locais relatadas pelo usuário,
com decisões determinísticas da simulação. Não são chamadas reais a IA ou
MCP e não são testes automatizados.

| Cenário | Execução observada | Encerramento |
| --- | --- | --- |
| Falha temporária seguida de sucesso | A primeira tentativa falhou, a segunda funcionou, um resultado foi registrado e a próxima simulação produziu a resposta final. | `resposta_final` |
| Erro definitivo | A ferramenta falhou sem registrar resultado e não houve nova chamada à simulação. | `erro_ferramenta` |
| Falha temporária persistente | As duas tentativas falharam, sem registro de resultado e sem nova chamada à simulação. | `erro_ferramenta` |
| Carlos seguido de Ana | Carlos retornou lista vazia; Ana retornou `["09:00", "14:00"]`; a terceira chamada produziu a resposta final. | `resposta_final` |

No último cenário, a contagem relatada foi:

- 3 chamadas à simulação do modelo;
- 2 solicitações de ferramenta;
- 4 tentativas de execução;
- 2 resultados registrados.

## Como executar

Na pasta `03-harness`:

```bash
npm install
npm run typecheck
npm start
```

O script `start` executa `src/harness-simulado.ts` com `tsx`. O script
`typecheck` executa o compilador TypeScript sem emitir arquivos. O projeto
usa módulos ESM e TypeScript estrito.

## Limitações e próximos passos

As tentativas são imediatas e não têm política de espera configurável além
da espera didática de 1 segundo. A falha provocada artificialmente é um
mecanismo de teste, não um comportamento desejado da ferramenta real.

Repetir uma consulta é diferente de repetir uma criação de agendamento:
depois de uma falha de conexão, uma operação de escrita pode já ter sido
realizada. Idempotência foi discutida conceitualmente, mas não foi
implementada. Também não foram implementadas orientação do serviço sobre
quando repetir nem políticas mais completas de intervalo.

A etapa de harness simulado foi concluída no escopo estudado. O próximo passo
seria substituir a simulação por chamadas à Groq, preservando os controles
pertinentes de histórico, tentativas e encerramento; essa integração ainda
não foi implementada neste estudo.

Essa etapa local não deve ser confundida com a integração Groq + MCP já
construída em `02-mcp`. As falhas artificiais deste exercício também não
representam falhas da ferramenta real.

O arquivo temporário `src/tempCodeRunnerFile.ts` existe no projeto, mas não é
usado pelo comando `npm start`; o cenário documentado corresponde ao arquivo
ativo `src/harness-simulado.ts`.
