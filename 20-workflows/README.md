# 20-workflows

## Objetivo

Construir um workflow local que prepara um rascunho, pausa para aprovação e
depois finaliza. A tarefa é **retomada a partir do estado persistido**, e
um resultado já concluído é reaproveitado, sem ser refeito.

```text
pendente → aguardando_aprovacao → aprovado → concluido
```

## Conceitos

- **Definição e execução:** a definição do workflow é o código de
  `workflow.ts`, igual para todas as tarefas. Uma execução é uma tarefa
  concreta, identificada por um ID (`wf-…`), com estado e rascunho próprios no
  banco. Retomar usa o **mesmo** ID; criar outro ID significa uma tarefa nova.
- **Esperar é gravar e terminar:** nada fica rodando à espera da aprovação.
  Cada comando é um processo curto: lê o estado, faz no máximo uma etapa, grava
  e termina. Não existe loop, requisição aberta nem transação aberta durante a
  espera.
- **Rascunho imutável e aprovação vinculada:**
  - o rascunho não muda depois de gravado;
  - a aprovação recebe o ID da execução **e** o ID do rascunho que foi
    apresentado, e só vale se os dois combinarem.
- **Gravações conjuntas:**
  - o rascunho e o estado `aguardando_aprovacao` são gravados na mesma
    transação;
  - a finalização e o estado `concluido` também.

  Assim, uma falha no meio não deixa um registro sem o estado correspondente.

## Estrutura

```text
20-workflows/
  src/
    tipos.ts          Estado, Execucao, Rascunho, Finalizacao, ResultadoDaRetomada, ErroDoWorkflow
    banco.ts          SQLite: tabelas, emTransacao, funções de leitura e gravação
    etapas.ts         gerador determinístico, finalizador local, falha simulada, logs com pid
    workflow.ts       decisões do fluxo (implementadas por Wagner)
    cli.ts            comandos criar, consultar, retomar, aprovar
    investigacao.ts   executor da investigação
```

### Preparado pelo assistente

- **Configuração:** a configuração do pacote e o `.gitignore`, que ignora
  `dados/`.
- **Banco:**
  - o esquema SQLite;
  - o helper `emTransacao`: `BEGIN IMMEDIATE` e depois `COMMIT`, ou `ROLLBACK`
    se houver exceção;
  - as funções que só leem e gravam, sem decidir nada conforme o estado.
- **Etapas:**
  - o gerador de rascunho, determinístico;
  - o finalizador local, que só registra o resultado na tabela `finalizacoes`.

  Os dois têm contadores em memória e logs com o pid.
- **Terminal:** os comandos.
- **Investigação:**
  - o ponto de injeção da falha;
  - o executor, com banco temporário, processos separados e inspeção só de
    leitura.

### Implementado por Wagner (`workflow.ts`)

| Função | Comportamento |
|---|---|
| `retomar` | busca a execução (inexistente → `EXECUCAO_NAO_ENCONTRADA`) e usa um `switch` que chama a etapa do estado |
| `prepararRascunho` | gera o texto e, num mesmo `emTransacao`, grava o rascunho e `aguardando_aprovacao` com o vínculo |
| `apresentarEspera` | busca o rascunho por `execucao.rascunhoId`, sem gerar de novo; se faltar, `ESTADO_INVALIDO` |
| `aprovar` | confere a existência e o vínculo (`APROVACAO_INVALIDA`, sem gravar); se já estiver `aprovado` ou `concluido`, devolve como está; se estiver `aguardando_aprovacao`, grava `aprovado` |
| `finalizar` | num mesmo `emTransacao`, registra a finalização e `concluido` |
| `recuperarConclusao` | devolve a finalização já registrada; se ela faltar, `ESTADO_INVALIDO` |

No `investigacao.ts`, o Wagner implementou as comparações dos três passos da
investigação.

## Comportamento

- **Retomada sem aprovação:** devolve o mesmo rascunho, sem gerar outro.
- **Aprovação com vínculo errado:** um rascunho inventado, o rascunho de outra
  execução ou outra execução com este rascunho são rejeitados com
  `APROVACAO_INVALIDA`, sem alterar nada.
- **Aprovação repetida:** não cria outra tarefa e não faz o estado regredir. Uma
  execução `concluido` continua `concluido`.
- **Execução concluída:** a retomada devolve o resultado registrado, sem
  finalizar de novo.
- **Falhas explícitas:**

  | Caso | Erro |
  |---|---|
  | execução inexistente | `EXECUCAO_NAO_ENCONTRADA` |
  | aprovação inválida | `APROVACAO_INVALIDA` |
  | dados incoerentes: aguardando sem rascunho, ou concluído sem finalização | `ESTADO_INVALIDO` |

## Construção: verificações

O assistente executou cada comando num **processo separado**, com pids
distintos no log, sempre com o mesmo banco temporário e o mesmo ID. Não foi só
uma conexão reaberta dentro do mesmo processo.

| Passo | Resultado |
|---|---|
| criar → retomar | `aguardando_aprovacao`, com o gerador chamado uma vez |
| retomar sem aprovação | o mesmo rascunho, sem a linha do gerador no log |
| aprovar com o rascunho errado | `APROVACAO_INVALIDA`; estado inalterado; 1 rascunho e 0 finalizações |
| aprovar correto | `aprovado` |
| retomar | finalização registrada, `concluido` |
| retomar de novo | o mesmo resultado, sem a linha do finalizador |
| aprovar de novo | continua `concluido` |
| consultar | `concluido`; 1 rascunho e 1 finalização persistidos |
| retomar com um ID inexistente | `EXECUCAO_NAO_ENCONTRADA` |

**A evidência de não repetição** combina duas fontes: os **registros
persistidos** (as contagens em `rascunhos` e `finalizacoes`) e os **logs** de
cada processo, onde a linha do gerador ou do finalizador não aparece.

Os contadores em memória recomeçam em 0 a cada processo. Um contador zerado num
processo novo, portanto, não prova que a etapa não foi repetida antes.

## Investigação: falha entre a finalização e o estado

**Montagem:**

- **A falha:** fica desligada por padrão e é ligada com
  `FALHA_APOS_FINALIZACAO=1`. O finalizador lança uma exceção **depois** do
  `INSERT` em `finalizacoes`. Como ele é chamado dentro do `emTransacao` e antes
  do `atualizarEstado`, a falha cai entre as duas gravações da mesma transação.
- **O que não muda:** o caminho normal é o mesmo, e não há limpeza manual
  simulando o rollback.
- **O executor (`npm run investigar`):**
  - usa um **banco temporário isolado**, numa pasta nova em `%TEMP%` a cada
    execução, sem tocar em `dados/workflows.db`;
  - roda cada retomada num processo separado;
  - inspeciona o banco **só para leitura**;
  - exige a falha simulada na retomada que deve falhar, e qualquer outro erro
    interrompe a investigação.

**Resultados:**

| Etapa | Log | Banco (inspeção) |
|---|---|---|
| retomada com a falha | finalização **INSERIDA**; falha simulada; erro | `aprovado`, **0** finalizações |
| retomada normal, outro processo | finalização registrada | `concluido`, **1** finalização |
| nova retomada, outro processo | sem a linha do finalizador; o mesmo resultado | 1 finalização, com o mesmo ID guardado |

- **O log do INSERT não comprova o commit:** a tentativa de inserir aconteceu,
  mas foi desfeita pelo rollback. Uma tentativa não é uma finalização
  persistida.
- **O ID é incidental:** a finalização persistida recebeu o mesmo número da
  tentativa desfeita. Isso aconteceu porque o rollback também desfez a
  atualização do contador do `AUTOINCREMENT`. As comparações usaram o ID
  efetivamente registrado, nunca um número fixo.
- **Teste separado de `ESTADO_INVALIDO`:** num banco temporário, uma execução
  forçada para `concluido` sem finalização recebeu `ESTADO_INVALIDO` ao ser
  retomada.

## Execução

### Instalação

Na raiz do repositório:

```powershell
npm install --prefix 20-workflows
```

### Comandos

Na pasta do módulo:

```powershell
cd 20-workflows
npm run typecheck

npm run wf -- criar "Lançamento da linha Aurora"
npm run wf -- consultar <id>
npm run wf -- retomar <id>
npm run wf -- aprovar <id> <rascunhoId>

npm run investigar
```

### Armazenamento

Por padrão, o banco fica em `dados/workflows.db`, dentro do módulo e ignorado
pelo Git. Ele persiste entre comandos: apagar o arquivo recomeça do zero.

Para usar outro arquivo, defina `BANCO_WORKFLOWS`. No PowerShell 7, a variável
vale para a sessão do terminal até ser removida:

```powershell
$env:BANCO_WORKFLOWS = "$env:TEMP\workflows-teste.db"
npm run wf -- criar "Teste"
Remove-Item Env:BANCO_WORKFLOWS   # volta a usar dados/workflows.db
```

`FALHA_APOS_FINALIZACAO` funciona do mesmo jeito: se definida como `"1"` na
sessão, ela afeta todas as retomadas seguintes até ser removida com
`Remove-Item Env:FALHA_APOS_FINALIZACAO`. O `npm run investigar` define as duas
variáveis só para os processos que ele mesmo inicia, sem alterar a sessão do
terminal.

## Verificações

As verificações registradas neste README foram feitas pelo assistente, durante
a construção e a investigação:

- typecheck sem erros;
- o roteiro da construção, com comandos em processos separados;
- `npm run investigar`;
- o teste do `ESTADO_INVALIDO`;
- na preparação, um roteiro do `emTransacao`: o rollback desfaz o rascunho e o
  estado juntos, e o commit grava.

Os roteiros auxiliares eram temporários, ficaram fora do módulo e não são
testes permanentes.

## Limitações

- **Um processo por vez:** não há tratamento de concorrência.
- **Sem integrações:** não há API, modelo, frontend nem efeitos externos. A
  finalização é um registro local.
- **Aprovação pelo terminal:** é uma ação explícita, não uma autenticação.
- **Falha controlada:** a exceção controlada não testa um encerramento abrupto
  do processo.
- **Alcance da transação:** ela cobre só o SQLite local.
- **Não é um motor de workflow:** o módulo demonstra a retomada pelo estado
  persistido. Não é o replay de um motor como Temporal ou LangGraph, nem garante
  que efeitos externos aconteçam exatamente uma vez.
- **Tabelas sem `UNIQUE`:** as tabelas `rascunhos` e `finalizacoes` não têm
  `UNIQUE` por execução **de propósito**, para que uma repetição apareça como
  linha a mais e possa ser observada. Isso não é uma recomendação geral de
  modelagem.
