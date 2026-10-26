# 13-persistencia

## Objetivo

Preservar o estado da aplicação depois de reiniciar o backend e recuperar uma
operação concluída mesmo quando o cliente não recebeu a resposta de sucesso.

No módulo 12, conversas, propostas, agendamentos e registros de idempotência
ficavam em memória e se perdiam a cada reinício. Aqui eles ficam num arquivo
SQLite.

## Arquitetura

A aplicação é derivada do módulo 12, que foi preservado como referência. O
frontend é o mesmo, sem redesenho. O backend troca o armazenamento em memória
pelo banco e mantém as rotas, os contratos HTTP, as ferramentas e as
instruções do modelo.

```text
13-persistencia/
  backend/src/
    banco.ts           conexão, esquema, transações e funções de acesso
    agendamentos.ts    preparação e confirmação de propostas
    conversas.ts       histórico lido do banco, trava por conversa
    app.ts             rotas, erros e a falha simulada da investigação
    server.ts          servidor real, configuração por variáveis de ambiente
    inspecionar.ts     inspeção do banco, somente leitura
    test/              testes de banco e de app com modelo simulado
  frontend/            o mesmo do módulo 12
```

### Persistência

- **Banco:** SQLite pelo módulo embutido do Node, `node:sqlite`
  (`DatabaseSync`, síncrono). Não há dependência nova nem ORM.
- **Arquivo:** por padrão, `backend/dados/agenda.sqlite`, ignorado pelo Git.
  A variável `CAMINHO_DO_BANCO` permite escolher outro arquivo.
- **Esquema:** criado ao abrir o banco, com `CREATE TABLE IF NOT EXISTS`. As
  chaves estrangeiras estão ativas, e não há migrações.

| Tabela | Conteúdo | Restrições |
|---|---|---|
| `conversas` | id e usuário dono | — |
| `mensagens` | conversa, `ordem` e a mensagem inteira em JSON (inclusive `tool_calls` e `tool_call_id`) | chave `(conversa_id, ordem)`; referência a `conversas` |
| `propostas` | conversa, usuário, cliente, profissional, data, horário e `chave_operacao` | `chave_operacao` única; referência a `conversas` |
| `agendamentos` | cliente, profissional, data e horário | `UNIQUE (profissional, data, horario)` |
| `operacoes` | chave, dados aprovados e `agendamento_id` | chave `(usuario, tipo_operacao, chave)`; `agendamento_id` único, com referência a `agendamentos` |

Nenhuma gravação usa `INSERT OR REPLACE`: um conflito sempre aparece como
erro, e uma operação existente nunca é sobrescrita.

### Histórico

O histórico de cada conversa é lido do banco e enviado explicitamente ao
modelo em cada rodada. Persistir as mensagens não basta: elas precisam entrar
na chamada ao modelo.

As mensagens novas de uma interação só são gravadas, juntas e numa transação
curta, quando há resposta final do modelo. Se o processamento falhar, o
histórico gravado não muda.

### Usuário

O usuário continua simulado (`joao`). Cada conversa é gravada com o usuário
que a criou, e só esse usuário a acessa. Persistir o vínculo não equivale a
autenticação real.

## Responsabilidades

### Infraestrutura preparada

Em `banco.ts`:

- **Abertura e transações:** `abrirBanco`, `criarEsquema` e `emTransacao`.
- **Leitura e gravação:**
  - `inserirConversa`, `buscarConversa`;
  - `listarMensagens`, `acrescentarMensagens`;
  - `inserirProposta`, `buscarProposta`;
  - `inserirAgendamento`, `buscarAgendamento`, `horarioReservado`, `contarAgendamentos`;
  - `buscarOperacao`, `inserirOperacao`.
- **Erros de unicidade:** `eViolacaoDeUnicidade`.

Em `agendamentos.ts`, auxiliares e preparação:

- `TIPO_OPERACAO`, `chaveDaOperacao`, `mesmosDados` e `confirmado`;
- `horarioDisponivel`, que combina a agenda fictícia do módulo 03 com os
  agendamentos gravados;
- preparação de propostas, que grava a proposta com vínculos e a chave
  estável `proposta-<id>`, sem criar agendamento.

Também preparados:

- histórico persistido em `conversas.ts`;
- novos códigos de erro da confirmação, `CONVERSA_NAO_ENCONTRADA` (404) e
  `OPERACAO_EM_CONFLITO` (409);
- o mecanismo de falha simulada e o script de inspeção.

### Lógica implementada no exercício

A função `confirmar`, em `agendamentos.ts`, faz:

1. **Conversa:** precisa existir e pertencer ao usuário da sessão; senão,
   `CONVERSA_NAO_ENCONTRADA`.
2. **Proposta:** precisa existir e pertencer à conversa e ao usuário; senão,
   `PROPOSTA_NAO_ENCONTRADA`. Conhecer um identificador não concede acesso: a
   conversa ou a proposta de outro usuário recebe a mesma resposta que um id
   inexistente.
3. **Operação existente:** é buscada pela chave da proposta, com escopo de
   usuário e tipo de operação.
   - Mesma chave e mesmos dados: recupera o agendamento gravado e devolve
     `reutilizado`.
   - Mesma chave com dados diferentes: `OPERACAO_EM_CONFLITO`, sem gravar.
4. **Operação nova:**
   - aplica os controles do módulo 09;
   - revalida a disponibilidade;
   - grava agendamento e operação na mesma transação;
   - devolve `criado`.
5. **Erros na transação:** uma violação de unicidade vira
   `HORARIO_INDISPONIVEL` (409). Qualquer outro erro é relançado como está e
   chega ao navegador como `500 ERRO_INTERNO` genérico, com a causa registrada
   no log. Erros internos não são classificados como falta de disponibilidade
   ou de autorização.

A recuperação acontece antes da verificação de disponibilidade. Assim, o
horário ocupado pelo próprio agendamento não impede a recuperação.

### Idempotência e unicidade do horário

São proteções diferentes:

- **Idempotência** identifica uma operação repetida. A chave é criada com a
  proposta e não muda a cada clique, requisição ou reinício. Com a chave, os
  dados aprovados e o agendamento persistidos, a repetição é reconhecida
  mesmo depois de reiniciar o backend.
- **Unicidade de profissional, data e horário** protege a reserva neste
  domínio de horários fixos. Ela não resolve sobreposição geral de
  intervalos, como uma consulta das 9:00 às 10:00 contra outra das 9:30 às
  10:30.

Uma tentativa com chave nova, por exemplo a partir de outra proposta para o
mesmo horário, não recupera a operação anterior. Mas também não leva
necessariamente a uma duplicação: a restrição do horário pode rejeitar a nova
tentativa.

## Transações

`emTransacao(banco, trabalho)`:

- abre a transação com `BEGIN IMMEDIATE`, que reserva a escrita desde o
  início;
- faz `COMMIT` se o trabalho terminar e `ROLLBACK` se ele lançar erro, que é
  relançado;
- recusa trabalho assíncrono, para que nenhuma transação fique aberta durante
  um `await`.

Na confirmação, o agendamento é inserido primeiro, e o registro da operação,
que referencia o id dele, vem em seguida, dentro da mesma transação. Nenhuma
chamada ao modelo acontece dentro de uma transação, e a confirmação não chama
a Groq.

A evidência de que uma falha desfaz a gravação parcial é um teste de banco:
quando a inserção da operação falha, o rollback também desfaz o agendamento
inserido antes dela.

O endpoint de confirmação **não** é atômico como um todo. Há duas gravações
separadas:

1. agendamento e operação, numa transação, dentro de `confirmar`;
2. o "Registro da aplicação" no histórico da conversa, em outra transação,
   depois que `confirmar` devolve.

Na investigação, o agendamento e a operação tinham o mesmo instante gravado
(`criado_em` e `concluida_em`). Timestamps iguais são compatíveis com a mesma
transação, mas não comprovam isso.

## Investigação: falha depois do commit

### Mecanismo

- **Ativação:** `FALHAR_APOS_CRIAR=1` ao iniciar o backend; desativado por
  padrão. Não pode ser ativado pela requisição nem pelo modelo.
- **Ponto de atuação:** na rota de confirmação, depois que `confirmar` gravou
  agendamento e operação e depois que o registro no histórico foi gravado. Só
  quando o resultado é `criado`, a rota lança um erro e o cliente recebe
  `500 ERRO_INTERNO`.
- **Natureza da falha:** simula a ausência da resposta de sucesso por meio de
  um erro HTTP após a gravação. Não é uma queda real de rede nem perda literal
  de pacotes.
- **Onde não atua:** operações recuperadas, erros de validação e qualquer ponto
  antes do commit. Não apaga nem altera registros.
- **Identificação no log:** ao iniciar, o backend registra "backend do módulo
  13 iniciado", com PID, arquivo do banco e estado da falha.
- **Banco:** separado, `dados/investigacao.sqlite`, com inspeção somente
  leitura.

### Previsões, registradas antes da execução

1. Deve existir um agendamento após a falha.
2. Após reiniciar e repetir a mesma confirmação, deve retornar `reutilizado`.
3. Um erro no frontend não comprova que a gravação falhou.

### Execução relatada

A ordem efetivamente relatada foi:

1. Com a falha ligada, foi criada pelo chat uma proposta para Ana, em
   2026-10-20, às 14:00.
2. A confirmação pelo botão apresentou erro. O card mostrou "Não foi possível
   processar a mensagem", relatado como HTTP 500.
3. A repetição por `curl`, ainda antes do reinício e com a falha ligada,
   retornou `200 reutilizado`, agendamento ID 1.
4. A inspeção encontrou 1 agendamento (ID 1) e 1 operação com a chave da
   proposta, vinculada a ele.
5. O backend foi reiniciado com o mesmo banco e a falha desativada.
6. A repetição voltou a retornar `reutilizado`, ID 1.
7. A inspeção mostrou a mesma quantidade de registros: 1 agendamento e 1
   operação.

As três previsões se confirmaram. A recuperação foi observada antes e depois
do reinício: antes, mostra que o reconhecimento não depende de reiniciar;
depois, que ele vem do arquivo do banco, e não da memória do processo.

O reinício foi relatado pelo aluno, sem as linhas de log com os PIDs. O status
500 inicial também foi relatado, a partir da mensagem do card, sem captura do
DevTools.

## Conceitos consolidados

- Um erro no cliente não comprova que a gravação deixou de acontecer.
- O commit no banco e a entrega da resposta HTTP são eventos distintos: o
  primeiro pode ocorrer sem o segundo.
- Persistir a chave, os dados aprovados e o resultado permite reconhecer a
  repetição depois de reiniciar o backend.
- O horário ocupado pelo próprio agendamento não deve impedir a sua
  recuperação.
- A existência de um identificador não concede autorização.
- Reiniciar o backend preservando o arquivo do banco é diferente de perder o
  arquivo: sem ele, conversas, propostas e operações deixam de existir.

## Execução

O módulo é executado com Node pelo WSL. O backend importa código dos módulos
03, 04, 06, 07, 08 e 09; os módulos 04 e 06 precisam das dependências
instaladas. A chave da Groq fica na variável `GROQ_API_KEY`, no `.env` da raiz
do repositório, e é lida apenas pelo backend.

```bash
(cd 04-contexto && npm install)
(cd 06-embeddings && npm install)
(cd 13-persistencia/backend && npm install)
(cd 13-persistencia/frontend && npm install)
```

Executar, em dois terminais:

```bash
# backend, porta 3001, banco padrão dados/agenda.sqlite
cd 13-persistencia/backend
npm start          # ou npm run dev, que reinicia ao salvar arquivos

# frontend, porta 5173
cd 13-persistencia/frontend
npm run dev
```

Escolher o banco e ligar a falha simulada, na pasta `backend`:

```bash
CAMINHO_DO_BANCO=dados/investigacao.sqlite npm start                       # falha desligada
CAMINHO_DO_BANCO=dados/investigacao.sqlite FALHAR_APOS_CRIAR=1 npm start   # falha ligada
```

Para desligar a falha, encerre o backend e inicie de novo sem a variável. Na
investigação, use `npm start`, e não `npm run dev`, para que o reinício seja
controlado.

Inspecionar os registros, em modo somente leitura:

```bash
CAMINHO_DO_BANCO=dados/investigacao.sqlite npm run inspecionar
CAMINHO_DO_BANCO=dados/investigacao.sqlite npm run inspecionar -- <propostaId>
```

Repetir uma confirmação sem a interface:

```bash
curl -s -w ' [%{http_code}]\n' -X POST -H 'content-type: application/json' -d '{}' \
  http://127.0.0.1:3001/conversas/<conversaId>/propostas/<propostaId>/confirmar
```

Verificações:

```bash
cd 13-persistencia/backend
npm run typecheck
npm test

cd 13-persistencia/frontend
npm run build
npm run lint
```

- **Consome a Groq:** cada mensagem válida enviada pelo chat, inclusive as que
  preparam propostas.
- **Não consome a Groq:** criação de conversa, confirmação, inspeção e testes.

## Evidências

Os registros abaixo são de etapas anteriores. Nenhuma verificação foi executada
durante a escrita desta documentação.

**Última execução da suíte do backend:** `npm test`, 26 testes passando,
com typecheck sem erros. Os 26 se dividem assim:

- **Testes de banco** (`banco.test.ts`, 8), sem HTTP e sem modelo:
  - esquema recriável sem perda de dados;
  - chaves estrangeiras ativas;
  - ordem e conteúdo das mensagens preservados;
  - unicidade da chave da proposta, do horário e da operação, com escopo por
    usuário;
  - commit, rollback que desfaz o agendamento quando a operação falha e
    recusa de trabalho assíncrono;
  - dados preservados ao fechar e reabrir o arquivo.
- **`app.inject` com modelo simulado** (Fastify dentro do processo, sem
  conexão de rede), 18 testes:
  - `persistencia.test.ts` (4): histórico recuperado após "reiniciar"
    entrando na chamada ao modelo; falha do modelo não grava; conversa de
    outro usuário com 404; proposta preservada sem agendamento;
  - `falha.test.ts` (3): falha desativada por padrão; ativada, devolve 500 com
    agendamento, operação e registro gravados; ativada, não afeta erros de
    validação nem recuperação;
  - `app.test.ts` (6) e `ferramentas.test.ts` (5): testes dos blocos 1 e 2 do
    módulo 12, adaptados ao banco.

A suíte não tem testes da função `confirmar`. A implementação foi conferida
separadamente, com `app.inject`, modelo simulado e banco em memória, por um
roteiro temporário que não faz parte do módulo:

| Caso | Resultado |
|---|---|
| confirmar uma proposta nova | `criado` |
| repetir a confirmação | `reutilizado`, mesmo ID |
| proposta chamada por outra conversa | 404 |
| outro usuário, com a conversa dele ou com a do dono | 404 |
| segunda proposta para um horário ocupado | 409 `HORARIO_INDISPONIVEL` |
| operação adulterada no banco | 409 `OPERACAO_EM_CONFLITO` |

**HTTP pela rede, na preparação**, com banco temporário e sem Groq:

- a conversa persistiu após reiniciar o backend real;
- o backend subiu com a falha ligada e desligada, com PIDs diferentes no log;
- a inspeção não alterou o arquivo do banco.

**Frontend:** build e lint sem erros, com 3 avisos herdados do módulo 12, sobre
a ordem do `useEffect` em relação aos `useState`.

**Relatado pelo aluno, sem reexecução:**

- **Cenário de construção:** confirmar, reiniciar o backend e repetir por
  `curl` devolveu `reutilizado` com o mesmo ID, e o banco ficou com um
  agendamento.
- **Investigação da falha após o commit,** descrita acima.

## Limitações

- **Um processo e um banco local.** A trava por conversa fica em memória, e a
  concorrência entre processos não foi estudada.
- **Sem autenticação real, migrações de esquema ou recuperação automática da
  interface.** Depois de um erro, a interface mostra a falha e só exibe a
  recuperação quando o usuário repete a confirmação.
- **`eViolacaoDeUnicidade` não distingue as restrições.** Ela não separa a
  unicidade do horário da chave da operação. Se a chave da operação falhasse
  por outra requisição concluir a mesma operação, a resposta seria
  "horário indisponível", e não `reutilizado`.
- **Agendamento ausente na recuperação** ainda é tratado como
  `CONFIRMACAO_BLOQUEADA` (403), embora seja uma inconsistência interna. Na
  prática não ocorre, por causa da chave estrangeira.
- **Registro no histórico separado.** O "Registro da aplicação" é gravado
  numa transação separada da gravação do agendamento e da operação.
- **Mensagem genérica.** O erro 500 da confirmação usa a mensagem "Não foi
  possível processar a mensagem.", que cita "mensagem" numa falha de
  confirmação.
- **Id da confirmação aleatório.** A confirmação usada nos controles do
  módulo 09 recebe um id aleatório a cada chamada, e não um id derivado da
  proposta.
- **A falha investigada é um HTTP 500 controlado,** não uma interrupção real
  de conexão.
- **Datas fixas.** As datas usadas, como 2026-10-20, são dados fixos do
  exercício.
- **Comentários `TODO`** continuam no código, embora implementados.
