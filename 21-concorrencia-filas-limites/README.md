# 21-concorrencia-filas-limites

## Objetivo

Construir uma fila persistida em SQLite com tarefas de processamento
**simulado** de documentos e consumi-la com:

- **aquisição atômica:** cada tarefa vai para quem efetivamente a marcou;
- **limite de concorrência:** no máximo 3 tarefas em processamento ao mesmo
  tempo;
- **rate limiting:** cada início acontece pelo menos 150 ms depois do anterior.

Depois, **investigar** com dois processos independentes disputando a mesma
tarefa no mesmo arquivo SQLite. A comparação é entre uma aquisição ingênua
(ler e depois atualizar) e a aquisição atômica construída no módulo.

Não há modelo real, Redis, BullMQ, frontend nem infraestrutura externa. Os
documentos são fictícios, da Aurora.

## Conceitos

### Execução sequencial, concorrência e paralelismo

- **Execução sequencial:** uma tarefa começa só depois que a anterior termina.
- **Concorrência:** várias tarefas estão **em andamento** no mesmo período,
  intercalando-se. No consumidor deste módulo, a concorrência é **assíncrona
  dentro de um processo**: as tarefas se sobrepõem porque cada processamento é
  um `await` de timer, e não porque há threads.
- **Paralelismo:** trechos executam **ao mesmo tempo** em núcleos ou processos
  diferentes. Na investigação, há dois processos do sistema operacional, com
  PIDs distintos, disputando o mesmo banco.

### Fila persistente, produtores, consumidores e workers

- **Fila persistente:** a fila é a tabela `tarefas` de um arquivo SQLite. Ela
  sobrevive ao processo e pode ser lida por vários processos.
- **Produtor:** insere tarefas `pendente`. Aqui, é a função `popularFila`.
- **Consumidor ou worker:** adquire tarefas e as processa. Aqui, é a função
  `consumirFila`, rodando com um executor identificado (`exec-A` na
  construção, e `exec-1`/`exec-2` na investigação).

```text
pendente → processando → concluida
                       ↘ falha       (sem retry automático)
```

### Race condition na aquisição

Um consumidor ingênuo faz dois passos: **lê** uma tarefa pendente e depois a
**marca** como sua. Se outro consumidor ler a mesma tarefa entre esses dois
passos, os dois acreditam que a adquiriram e os dois a processam.

### Três mecanismos diferentes

| Mecanismo | Pergunta que responde | Onde |
|---|---|---|
| **Aquisição atômica** | *quem* fica com cada tarefa | `adquirirProxima` em `fila.ts` |
| **Limite de concorrência** | *quantas* tarefas rodam ao mesmo tempo | semáforo em `limites.ts` |
| **Rate limiting** | *com que frequência* uma tarefa começa | espaçamento em `limites.ts` |

Um mecanismo não substitui o outro. O semáforo não impede que dois
consumidores peguem a mesma tarefa, e a aquisição atômica não limita quantas
tarefas rodam.

### Relação com os módulos anteriores

- **13-persistencia:** aqui, o SQLite deixa de ser só armazenamento e passa a
  ser o **ponto de coordenação** entre consumidores.
- **10-idempotencia:** processar "exatamente uma vez" exigiria efeitos
  idempotentes. A aquisição atômica sozinha não garante isso (veja
  [Limitações](#limitações)).
- **14-observabilidade:** a evidência deste módulo vem de **eventos
  registrados**, e não do estado final. A instrumentação fica fora dos
  mecanismos medidos.
- **20-workflows:** lá, uma execução avançava a partir do estado persistido.
  Aqui, várias tarefas persistidas são disputadas por consumidores
  concorrentes.

## Construção

**Stack:** TypeScript, Node 24, `node:sqlite` (`DatabaseSync`, síncrono) e
`tsx`.

**Dados:** 10 documentos fictícios, em `dados.ts`. O processamento é um timer
com duração conhecida (`processador.ts`). O `doc-06` falha de propósito. A
configuração é: executor `exec-A`, `maxConcorrencia` 3 e `intervaloMinimoMs`
150.

### Os cinco TODOs (implementados por Wagner)

| TODO | Arquivo | O que faz |
|---|---|---|
| 1 | `fila.ts` | `adquirirProxima`: um único `UPDATE … WHERE id = (SELECT … pendente … LIMIT 1) AND estado = 'pendente' RETURNING *` passa a tarefa para `processando` com o executor e o horário. Devolve `null` quando não há pendentes |
| 2 | `fila.ts` | `processarTarefa`: faz o `await` do processamento **fora** de transação e depois um UPDATE curto para `concluida` ou `falha`, **condicionado a `estado = 'processando'` e ao executor**. Não relança a falha |
| 3 | `limites.ts` | semáforo: `ocupar()` espera vaga, e `liberar()` **entrega a vaga diretamente** a quem já esperava, sem devolvê-la ao contador |
| 4 | `limites.ts` | espaçamento fixo entre inícios: reserva a próxima vez **antes** de esperar e, ao acordar, ancora a seguinte no **instante real** |
| 5 | `consumidor.ts` | laço: ocupar vaga → aguardar a vez → adquirir (com `null`, libera a vaga e sai) → disparar o processamento sem `await`, liberando a vaga no `.finally`. No fim, aguarda **só os processamentos ainda em andamento** |

O restante foi preparado pelo assistente:

- os tipos, os dados e o banco;
- o processador simulado;
- a instrumentação (`instrumentacao.ts`), que envolve o processador por fora e
  mede inícios, términos e tarefas ativas sem participar dos limitadores;
- o executor (`executar.ts`) e a suíte.

### Resultados verificados

Resultado do `npm run executar` (banco temporário novo e um consumidor):

- **10 tarefas:** 9 `concluida` e 1 `falha` controlada (`doc-06`);
- **continuidade:** o consumo prosseguiu depois da falha, e houve inícios
  posteriores a ela;
- **aquisição:** cada tarefa foi adquirida uma única vez;
- **concorrência:** o pico de tarefas ativas foi **3**.

### Espaçamento temporal: a correção e o que ela demonstra

A primeira versão do TODO 4 ancorava a próxima vez no horário **reservado**.
Quando um timer disparava atrasado, o intervalo seguinte encolhia, e o menor
intervalo observado foi de **144,6 ms**. Com a âncora no instante real, os
menores intervalos nas 3 rodadas foram de **149,0, 150,7 e 149,0 ms**.

- **Com tolerância de 2 ms**, as três rodadas passam.
- **Pelo requisito estrito de 150 ms**, só uma das três passa (150,7 ms).
- **A tolerância é um critério experimental**, e não uma garantia do timer. Os
  timers do Node podem disparar alguns milissegundos antes do instante medido
  por `performance.now()`, por causa do relógio do laço em cache e dos
  milissegundos inteiros.
- **Outras observações:**
  - numa série posterior de 10 rodadas isoladas, o pior caso foi de 148,0 ms;
  - numa execução da suíte sob carga, apareceu um intervalo de 146,0 ms, fora
    da tolerância.
- **Escopo da validação:** o espaçamento foi validado no **padrão sequencial de
  chamadas** usado pelo consumidor, em que o laço chama `aguardarVez()` uma vez
  por vez. Ele não foi validado como um limitador genérico seguro para chamadas
  simultâneas.

### Limites locais, não globais

- **Escopo dos limites:** o máximo de 3 tarefas simultâneas e o espaçamento de
  150 ms valem para **uma chamada de `consumirFila`, num processo**. Dois
  consumidores, ou dois processos, teriam limites independentes, e o total
  poderia ultrapassá-los.
- **Sem intercalação dentro do processo:** como o `node:sqlite` é síncrono,
  cada instrução roda inteira.
- **Não é backpressure completo:** a fila de espera do semáforo é ilimitada. No
  consumidor ela não passa de um item, porque quem espera é o próprio laço, mas
  não há limite de produção nem de enfileiramento.

## Investigação: aquisição ingênua vs atômica entre dois processos

### Montagem (preparada pelo assistente)

Os arquivos ficam em `src/investigacao/`.

- **`investigar.ts`**, o orquestrador:
  - cada rodada usa uma **pasta temporária e um banco novos**, com **uma**
    tarefa pendente (`doc-01`, de 150 ms);
  - sobe dois processos filhos (`exec-1` e `exec-2`) com
    `node --import tsx executor.ts …`;
  - um código de saída diferente de zero aborta a investigação.
- **`executor.ts`**, cada processo:
  - abre a **própria conexão** com o mesmo arquivo, usando `abrirBanco` com
    `timeout: 1000` e depois `PRAGMA busy_timeout = 5000`;
  - qualquer erro inesperado, inclusive um `SQLITE_BUSY`, é registrado como
    evento `erro` e termina o processo com código 1. Ele **nunca é tratado como
    "não havia tarefa"**.
- **Cenário ingênuo** (variante **insegura**, que existe só na investigação):
  1. `SELECT` da pendente;
  2. **barreira** entre os processos: ninguém atualiza antes de os dois terem
     lido;
  3. `UPDATE … WHERE id = ?` **incondicional**, sem transação envolvendo os
     dois passos;
  4. quem teve `changes = 1` processa.
- **Cenário atômico:** chama `adquirirProxima`, o TODO 1 da construção,
  **sem alteração**. Só quem recebe uma tarefa processa.
- **`comum.ts`:**
  - cada executor grava os próprios eventos num JSONL (`eventos-<executor>.jsonl`);
  - as barreiras são arquivos na pasta compartilhada;
  - **largada comum:** os dois processos calculam o mesmo instante (a última
    chegada + 100 ms) e fazem uma espera ocupada até ele. Sem isso, a
    resolução do timer do Windows atrasava um deles em cerca de 15 ms, e a
    disputa virava uma fila. A espera ocupada é uma **técnica experimental**
    para alinhar os processos, **não uma recomendação para produção**.

O orquestrador também faz **verificações de infraestrutura**, e qualquer falha
invalida a rodada:

- nenhum evento `erro`;
- um PID por executor, e PIDs distintos entre si;
- o mesmo caminho de banco nos dois;
- a mesma largada nos dois;
- **ingênuo:** 2 leituras, a barreira alcançada pelos dois e toda atualização
  posterior à última leitura;
- **atômico:** 2 tentativas de aquisição.

O estado final do banco é impresso rotulado como **"não é evidência
suficiente"**.

### Os três TODOs de análise (implementados por Wagner)

Ficam em `src/investigacao/analise.ts`. As três funções usam **só os
eventos**: nenhuma consulta o estado final do banco ou depende de qual executor
vence.

| TODO | Função | O que faz |
|---|---|---|
| 1 | `analisarIngenuo` | agrupa por ID quem leu e quem iniciou o processamento e imprime os dois agrupamentos. `aquisicoesBemSucedidas` conta as atualizações com `changes = 1`. Há duplicação quando um ID tem mais de um executor processando |
| 2 | `analisarAtomico` | agrupa os executores por tipo de evento (tentou, adquiriu, ficou sem tarefa, processou), verifica que **só quem adquiriu processou** e detecta a duplicação agrupando os processamentos por ID |
| 3 | `compararCenarios` | compara as rodadas lado a lado (aquisições, processamentos e duplicação) e soma as duplicações de cada cenário. Trata listas de tamanhos diferentes |

**Validação das próprias análises:** antes das rodadas reais, as análises
foram testadas com **eventos sintéticos corretos e defeituosos**:

| Análise | Caso | Resultado |
|---|---|---|
| ingênua | os dois processam | {2, 2, `true`} |
| ingênua | só um alterou a linha | {1, 1, `false`} |
| atômica | caso correto | {1, 1, `false`}, "sim" |
| atômica | um executor processou sem adquirir | {1, 2, `true`}, "NÃO" |

Os três valores são aquisições, processamentos e duplicação. Esses roteiros
foram **temporários**, feitos pelo assistente fora do módulo, e **não fazem
parte da suíte permanente**.

### Resultados

Foram duas execuções de `npm run investigar -- 5`, somando 10 rodadas por
cenário. As duas terminaram com código 0, e todas as verificações de
infraestrutura passaram.

| Cenário | Aquisições por rodada | Processamentos por rodada | Duplicação |
|---|---|---|---|
| ingênuo | 2 | 2 | **10/10** |
| atômico | 1 | 1 | **0/10** |

- **Vencedor no atômico:** `exec-1` venceu 6 disputas e `exec-2` venceu 4. A
  análise deu o mesmo resultado nos dois casos.
- **Erros:** não houve evento `erro` nem `SQLITE_BUSY`.
- **Ingênuo, linha do tempo típica:**
  - os dois leem `doc-01` no mesmo milissegundo (+110 ms);
  - os `UPDATE` acontecem em momentos diferentes (+125 e +142 ms), mas **os
    dois retornam `changes=1`**;
  - os dois iniciam o processamento;
  - o banco termina com `concluida, executor=<um só>`.
- **Atômico, linha do tempo típica:**
  - as duas tentativas partem em +111 ms;
  - um executor recebe `doc-01` em +137 ms;
  - o outro recebe `null` (`sem_tarefa`) em +142 ms;
  - só o primeiro processa.

Também foram verificados o typecheck, sem erros, e a suíte da construção, com
6/6 testes.

### O que a investigação mostra

- **A serialização das escritas não impediu a duplicação.** O SQLite aplicou
  um `UPDATE` de cada vez, mas, como o `WHERE id = ?` não verifica o estado,
  os dois alteraram a linha. A atomicidade que importa é a da **condição**
  `estado = 'pendente'` dentro da mesma instrução.
- **O estado final escondia a duplicação.** A última gravação deixa um único
  executor registrado, como se só ele tivesse processado.
- **Os eventos mostram o que o estado final não preserva:** quem leu, quem
  tentou, quem atualizou e quem iniciou o processamento.

### Cuidados na leitura

- **A barreira força a condição de corrida**, mas não mede sua frequência
  natural. Não foi medido com que frequência o ingênuo duplica sem ela.
- **Dez rodadas não constituem prova universal.** A garantia do atômico vem da
  semântica do UPDATE condicional. O experimento mostra o comportamento nestas
  condições: uma máquina Windows, SQLite 3.53.3, 2 processos e 1 tarefa.
- **A ausência de `SQLITE_BUSY` não comprova, isoladamente, que houve espera
  por contenção.** Ela mostra só que nenhum erro de bloqueio chegou à
  aplicação. O intervalo entre a tentativa e o resultado não foi atribuído a
  uma causa.
- **A resolução dos timestamps é de 1 ms** (`Date.now()`). Eventos no mesmo
  milissegundo não têm uma ordem precisa, e as análises não dependem dela.
- **Os eventos são gravados pelos próprios processos.** A investigação confia
  nessa instrumentação.

## Aprendizados com erros

- **SQL válido pode afetar zero linhas sem lançar exceção.** No TODO 2, o
  `WHERE estado = 'concluida'` no UPDATE de sucesso não encontrava a linha
  (que estava em `processando`), e nada indicava o problema.
- **O typecheck não detecta erros de SQL.** Na primeira versão do `catch` do
  TODO 2, havia um estado inválido, colunas erradas e faltava o `.run`. Para o
  TypeScript, o SQL é só uma string, e foi a execução que revelou os erros.
- **Ancorar no horário reservado comprime intervalos.** No TODO 4, um timer
  atrasado fazia o intervalo seguinte encolher, chegando a 144,6 ms. A
  correção foi ancorar no instante real.
- **Um agrupamento vazio passa em qualquer `every`.** Na análise atômica, o
  `Set` era alterado mas nunca regravado no mapa. Todas as listas saíam
  vazias, e `[].every(...)` é sempre `true`, então a análise respondia "só
  quem adquiriu processou? sim" mesmo num caso defeituoso. Um agrupamento que
  filtrava um evento sem `tarefaId` também nunca era preenchido.
- **É preciso testar os próprios mecanismos de verificação com casos
  defeituosos.** As rodadas reais estavam corretas e não revelavam esses
  erros. Só os eventos sintéticos defeituosos mostraram que a análise não
  detectava nada.

## Execução

Na raiz do repositório:

```powershell
npm install --prefix 21-concorrencia-filas-limites
```

Na pasta do módulo:

```powershell
cd 21-concorrencia-filas-limites
npm run typecheck
npm run executar               # construção: banco temporário novo + um consumidor
npm test                       # suíte de regressão da construção
npm run investigar             # investigação: 3 rodadas por cenário
npm run investigar -- 5        # investigação: 5 rodadas por cenário
```

- **`executar`:** cria um banco temporário em `%TEMP%`, popula 10 tarefas e
  roda o consumidor `exec-A`. Depois imprime:
  - a linha do tempo;
  - o pico de tarefas ativas;
  - os intervalos entre inícios;
  - as aquisições por tarefa;
  - os estados finais.
- **`investigar`:** imprime, para cada rodada:
  - a linha do tempo dos dois processos;
  - as verificações de infraestrutura;
  - o estado final;
  - a análise.

  No fim, imprime a comparação entre os cenários.

### Suíte permanente

O arquivo `src/test/fila.test.ts` tem 6 testes, cada um com um banco
temporário novo. A suíte cobre **só a construção**.

| Teste | Verifica |
|---|---|
| TODO 1 | 10 aquisições sequenciais, todas distintas, com o executor gravado; depois, `null` |
| TODO 2 | sucesso → `concluida`; falha → `falha` com a mensagem, sem relançar; outro executor não sobrescreve |
| TODO 3 | o semáforo libera no máximo N; a vaga liberada vai para quem já esperava |
| TODO 4 | espaçamento sequencial (limite inferior folgado) e a âncora no instante real com timer atrasado |
| TODO 5 | as 10 tarefas terminam (9 `concluida`, 1 `falha`); houve início depois da falha; cada tarefa foi adquirida uma vez; pico ≤ 3; espaçamento como smoke test |

A suíte não exige precisão temporal irrealista:

- só verifica **limites inferiores** folgados: 10 ms de margem no fluxo
  completo e 75% do intervalo nos testes isolados;
- nunca verifica um limite superior de tempo.

O teste de **timer atrasado** distingue as duas versões do TODO 4. Numa cópia
de comparação, a âncora no horário reservado deu intervalos de 1 a 2 ms, e a
âncora no instante real deu de 45 a 52 ms.

**A investigação não está na suíte.** Ela é um roteiro executável
(`npm run investigar`), com verificações de infraestrutura próprias, e não um
teste automatizado. A validação das análises com eventos sintéticos foi
temporária e não ficou no módulo.

## Atribuição

| Parte | Responsável |
|---|---|
| Tipos, dados, banco, processador simulado, instrumentação, executor da construção, suíte de regressão | assistente |
| Infraestrutura da investigação: `comum.ts`, `executor.ts` (incluindo a variante ingênua), `investigar.ts` e as verificações de infraestrutura | assistente |
| TODOs 1–5 da construção: aquisição, persistência do resultado, semáforo, espaçamento, consumidor | Wagner |
| TODOs 1–3 da investigação: `analisarIngenuo`, `analisarAtomico`, `compararCenarios` | Wagner |
| Execuções do typecheck, da suíte, do `executar` e do `investigar`, além dos roteiros temporários de validação | assistente |

Os resultados registrados aqui vêm das execuções feitas pelo assistente. **O
revisor não executou os testes de forma independente.**

## Limitações

- **Aquisição atômica não garante processamento exatamente uma vez.** Ela
  garante **quem** fica com a tarefa, não o que acontece depois.
- **Queda depois da aquisição:** a tarefa fica presa em `processando` e não é
  processada de novo.
- **Recuperação e efeitos:** não há leases, recuperação automática nem retries.
  Também não há garantias sobre efeitos externos. "Exatamente uma vez"
  exigiria recuperar tarefas abandonadas e ter efeitos idempotentes.
- **Limites locais:** o limite de concorrência e o de taxa valem por
  consumidor. Não há limites globais entre processos nem backpressure
  completo.
- **Sem chegada contínua:** não há testes com novas tarefas chegando durante o
  consumo.
- **Escopo da investigação:** 2 processos, 1 tarefa por rodada e o ambiente
  efetivamente usado (Windows, Node 24, SQLite 3.53.3).
- **Rate limiting:** a garantia estrita de 150 ms não foi demonstrada, e o
  espaçamento foi validado só no padrão sequencial do consumidor.
- **Processamento simulado:** é um timer com duração conhecida, sem modelo
  real.
