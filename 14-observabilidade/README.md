# 14-observabilidade

## Objetivo

Observar uma rodada de conversa por meio de logs estruturados e
correlacionados. Para cada mensagem enviada ao backend, os eventos mostram:

- a duração total e a de cada etapa;
- quantas chamadas ao modelo e quantas execuções de ferramenta ocorreram;
- o consumo de tokens conhecido e se ele está completo;
- onde a rodada falhou, quando falha.

Não é uma implementação de tracing distribuído. Não há OpenTelemetry, coletor
nem serviço externo: os eventos saem pelo logger do Fastify (pino), na saída
do processo.

## Arquitetura

A aplicação é derivada do módulo 13, que foi preservado como referência. O
frontend é o mesmo. O backend mantém as rotas, os contratos HTTP, o banco
SQLite, as ferramentas e as instruções do modelo, e acrescenta a
instrumentação.

```text
14-observabilidade/
  backend/src/
    observabilidade.ts  relógio, extração de uso, diagnóstico de erro, eventos
    rodada.ts           chamadas ao modelo e execuções de ferramenta medidas
    app.ts              contexto por requisição, resumo da rodada, erros
    groq.ts             chamada real ao modelo, devolvendo mensagem e uso
    conversas.ts        repassa o contexto de observação a cada rodada
    simular.ts          rodada com modelo simulado, sem Groq
    test/               testes unitários e de app com modelo simulado
  frontend/             o mesmo do módulo 13
```

## Responsabilidades

### Infraestrutura preparada

Em `observabilidade.ts`:

- **Tempo:** `agoraMonotonico`, `duracaoDesde` e `instante`.
- **Uso:** `extrairUso` lê `prompt_tokens` e `completion_tokens` da resposta
  da Groq e devolve `undefined` quando o provedor não informa uso.
- **Erros:** `diagnosticarErro` devolve só `codigoErro` (código da aplicação
  ou nome do erro) e `statusErro`, nunca a mensagem.
- **Eventos:** tipos dos três eventos e `emitir`, que registra o sucesso em
  `info` e a falha em `warn`, acrescentando `instante`.
- **Contexto:** `criarContextoDeObservacao`, com contadores zerados e
  independentes a cada requisição.

Também preparados:

- o UUID por requisição (`genReqId`);
- o retorno `{ mensagem, uso }` do chamador do modelo, com `maxRetries: 0`;
- a passagem do contexto por `conversas.ts`;
- `simular.ts` e os testes descritos em [Verificações](#verificações).

### Lógica implementada no exercício

- **Rota de mensagens** (`app.ts`): cria o contexto, mede a duração total e
  emite `rodada.resumo` no sucesso e na falha.
- **Chamadas ao modelo** (`rodada.ts`): numeração, duração, acumulação de
  tokens, contagem de chamadas sem uso e evento `modelo.chamada` de sucesso ou
  falha.
- **Ferramentas** (`rodada.ts`): numeração própria, duração e evento
  `ferramenta.execucao` de sucesso ou falha.

## Instrumentação

### Correlação

- Cada requisição recebe um UUID gerado pelo backend; um id enviado pelo
  cliente não é aceito.
- Esse UUID aparece como `reqId` nas linhas do próprio Fastify e como
  `requisicaoId` nos eventos. Os nomes dos campos são diferentes; para
  filtrar uma requisição inteira, busca-se pelo valor.
- `requisicaoId` identifica uma mensagem enviada; `conversaId` identifica a
  conversa, que reúne várias requisições.
- O contexto e os contadores pertencem a uma única requisição. As várias
  rodadas internas da mesma requisição compartilham o mesmo contexto.

### Tempo

- **Duração:** relógio monotônico (`performance.now()`), arredondado a 0,1 ms.
  Não é afetado por ajustes do relógio do sistema.
- **Localização no tempo:** `instante`, em ISO 8601. Serve para situar o
  evento, não para calcular durações.

A duração total, em `rodada.resumo`, começa depois da validação do texto, logo
antes de processar, e termina quando `enviarMensagem` retorna ou lança erro.
Ela inclui as chamadas ao modelo, as ferramentas, a leitura e a gravação do
histórico, mas não inclui a leitura do corpo da requisição, a serialização nem
o envio da resposta. Não representa toda a espera do usuário e não comprova
que a resposta chegou ao cliente.

### Eventos

| Evento | Campos próprios |
|---|---|
| `modelo.chamada` | `numeroDaChamada`, `duracaoMs`, `status`; `tokensEntrada`, `tokensSaida` e `origemDoUso` só quando o uso é conhecido |
| `ferramenta.execucao` | `numeroDaExecucao`, `ferramenta`, `duracaoMs`, `status` |
| `rodada.resumo` | `status`, `duracaoMs`, `chamadasAoModelo`, `execucoesDeFerramenta`, `tokensEntrada`, `tokensSaida`, `chamadasSemUso`, `usoSimulado` |

Todos têm `evento`, `etapa`, `requisicaoId`, `conversaId` e `instante`. Na
falha, `status` é `"falha"`, o nível é `warn` e o evento traz `codigoErro` e,
quando existir, `statusErro`.

- **Numeração:** chamadas ao modelo e execuções de ferramenta têm contadores
  separados, cada um começando em 1 na requisição.
- **Resumo:** é emitido tanto no sucesso quanto na falha.
- **Erro:** depois de emitido o evento de falha, o mesmo erro é relançado. A
  resposta HTTP é a mesma de antes da instrumentação.
- **Sem retry:** uma chamada que falha não é repetida, nem pelo código nem pelo
  SDK (`maxRetries: 0`).

## Consumo e cobertura

- `prompt_tokens` e `completion_tokens` ficam separados, como `tokensEntrada`
  e `tokensSaida`, em cada chamada e no total da rodada.
- O resumo acumula o uso de todas as chamadas ao modelo da requisição.
- **Uso ausente não é consumo zero.** Quando uma chamada não informa uso, os
  campos de tokens ficam fora do evento e nada é somado ao total.
- **`chamadasSemUso`** conta toda tentativa de chamada sem uso conhecido: tanto
  uma resposta sem `usage` quanto uma chamada que falha. Com valor maior que
  zero, o total de tokens é parcial.
- A contagem fica num único ponto, o `finally` da chamada ao modelo, que roda
  no sucesso e no erro. Assim, cada tentativa é contada uma vez só.
- Numa rodada que falha, os tokens conhecidos das chamadas anteriores
  continuam no resumo.
- **Dados simulados:** o uso vindo de um modelo simulado tem origem
  `"simulado"`, e o resumo marca `usoSimulado: true`.

O consumo de tokens não indica a qualidade da resposta e não é uma estimativa
de custo em dinheiro.

## Execução real com a Groq

Uma única execução, pelo navegador, com a pergunta "Quais horários a Ana tem
em 2026-10-20?". O fluxo foi observado, não imposto ao modelo:

| Evento | Duração aproximada | Tokens (entrada / saída) |
|---|---|---|
| `modelo.chamada` nº 1 | 764,4 ms | 697 / 45 |
| `ferramenta.execucao` nº 1, `consultarDisponibilidade` | 0,4 ms | — |
| `modelo.chamada` nº 2 | 310,5 ms | 764 / 30 |
| `rodada.resumo`, sucesso | 1126,7 ms | 1461 / 75 |

- **Resumo:** 2 chamadas, 1 execução, `chamadasSemUso: 0`, `usoSimulado:
  false` e `origemDoUso: "groq"` nas duas chamadas.
- **Correlação:** os quatro eventos têm o mesmo `requisicaoId`, igual ao
  `reqId` das linhas do Fastify. O `responseTime` do Fastify foi de 1127,8 ms.
- **Resposta exibida:** 09:00 e 14:00, que é o que a ferramenta devolve para a
  Ana nessa data com a agenda vazia.

Os números valem para essa execução; não são média nem benchmark. A entrada da
segunda chamada foi pouco maior que a da primeira porque cada chamada reenvia
o histórico, mas a diferença entre as duas não mede, isoladamente, quanto cada
parte do histórico contribuiu.

As chamadas somam 1074,9 ms. Os cerca de 51 ms restantes do resumo e a
diferença de cerca de 1 ms para o `responseTime` não têm causa identificada:
nenhum evento mede esses trechos.

## Investigação: falha sem uso

### Problema

Uma chamada ao modelo que falhava não entrava em `chamadasSemUso`. A contagem
ficava dentro do `try`, depois do `await`, e só valia quando a chamada
retornava. Numa rodada com falha, o resumo mostrava os tokens das chamadas
anteriores com `chamadasSemUso: 0`, e a cobertura parecia completa.

### Cenário

Simulação determinística com `app.inject`, modelo simulado e banco em memória,
sem chamada à Groq:

1. chamada 1 pede `consultarDisponibilidade` e informa 180/25 tokens
   simulados;
2. a ferramenta executa com sucesso;
3. chamada 2 lança um erro simulado (`FALHA_SIMULADA_DO_MODELO`) sem uso.

### Previsões, registradas antes da execução

- 2 chamadas ao modelo;
- 1 execução de ferramenta;
- 180 tokens de entrada e 25 de saída conhecidos;
- cobertura incompleta, por faltar o uso da segunda chamada.

### Resultado

Antes da correção, o resumo saía com `chamadasSemUso: 0`. A contagem passou
para o `finally`. Depois disso, a execução relatada pelo aluno mostrou:

- os quatro eventos com o mesmo `requisicaoId`;
- chamada 1 com sucesso e 180/25 tokens;
- ferramenta nº 1 com sucesso;
- chamada 2 em `warn`, com falha, `codigoErro: "FALHA_SIMULADA_DO_MODELO"` e
  sem campos de tokens;
- resumo em `warn`, com falha, 2 chamadas, 1 execução, 180/25 tokens,
  `chamadasSemUso: 1` e o mesmo código de erro;
- resposta HTTP 500 `ERRO_INTERNO`, igual ao comportamento anterior.

O resultado coincidiu com as previsões.

## Proteção dos logs

Os eventos de observação registram identificadores, contadores, durações e o
diagnóstico seguro do erro. Não registram o texto das mensagens, o conteúdo
dos documentos consultados, os argumentos das ferramentas nem credenciais.

O tratador geral de erros, herdado do módulo 12, ainda registrava o objeto
original do erro, e o pino gravava a mensagem e o stack. Isso não comprova que
houve vazamento, mas impedia afirmar que os logs evitavam esse conteúdo. O
tratador passou a registrar `diagnosticarErro(falha)`, com a mensagem
"falha não tratada", por `request.log`, que mantém o `reqId`. A mensagem e o
stack originais deixaram de ser registrados nesse caminho, e a resposta HTTP
não mudou.

A verificação é o teste `log-de-erro.test.ts`. Ele usa `app.inject` com o
logger real do Fastify escrevendo num fluxo em memória. O processamento lança
um erro no formato dos erros do SDK, com nome, status 503 e uma mensagem
sensível fictícia. O teste confere:

- a ausência do conteúdo fictício em todas as linhas capturadas;
- `codigoErro` e `statusErro` na linha do tratador, no nível `error`;
- o `reqId` dessa linha igual ao `requisicaoId` do resumo;
- a resposta `500 ERRO_INTERNO` com o mesmo corpo de antes.

Com o tratador revertido temporariamente para `request.log.error(falha)`, o
teste falhou; a correção foi restaurada em seguida.

O teste cobre o caminho exercitado e a saída do logger deste backend. Não
garante todos os caminhos de log nem o que um processamento externo faria com
os logs. O registro de falhas na inicialização do servidor, em `server.ts`,
continua separado e registra o erro original.

Uma consequência: a falha simulada do módulo 13 (`FALHAR_APOS_CRIAR`) passa a
aparecer no log só com `codigoErro: "Error"`, sem a mensagem que citava o
agendamento.

## Execução

O módulo roda com Node 24. Os comandos abaixo foram usados no PowerShell 7 no
Windows; os comandos `npm` são os mesmos em outros terminais. Instale as
dependências no mesmo sistema em que for executar.

O backend importa código dos módulos 03, 04, 07, 08 e 09, e a busca de
políticas usa o modelo de embeddings do módulo 06. A chave da Groq fica na
variável `GROQ_API_KEY`, no `.env` da raiz do repositório, e é lida apenas
pelo backend.

Na raiz do repositório:

```powershell
npm install --prefix 04-contexto
npm install --prefix 06-embeddings
npm install --prefix 14-observabilidade/backend
npm install --prefix 14-observabilidade/frontend
```

Executar, em dois terminais:

```powershell
# backend, porta 3001, banco dados/agenda.sqlite (fora do Git)
cd 14-observabilidade/backend
npm start

# frontend, porta 5173
cd 14-observabilidade/frontend
npm run dev
```

Os eventos aparecem no terminal do backend, junto das linhas do Fastify; são
as linhas com o campo `"evento"`.

Simulações, na pasta `backend`:

```powershell
npm run simular                       # uso completo
npm run simular -- sem-uso            # segunda chamada sem uso, com sucesso
npm run simular -- falha-na-segunda   # segunda chamada falha, sem uso
```

As simulações usam `app.inject` (o Fastify dentro do processo, sem porta e
sem rede), um modelo simulado com 30 ms de espera por chamada e banco em
memória. Os tokens são fictícios, com origem `"simulado"`. A saída mostra
cada evento numa linha; as falhas aparecem com `"nivel":"warn"`, formato do
registrador da simulação, não do pino.

Verificações, na raiz do repositório:

```powershell
npm run typecheck --prefix 14-observabilidade/backend
npm test --prefix 14-observabilidade/backend
```

- **Consome a Groq:** cada mensagem válida enviada pelo chat.
- **Não consome a Groq:** criação de conversa, confirmação, simulações,
  typecheck e testes.

## Verificações

**Executadas durante a escrita desta documentação**, sem chamada à Groq:

- typecheck sem erros;
- `npm test`: 35 testes passando, na mesma suíte que antes tinha 31 e depois
  34, à medida que os testes deste módulo foram acrescentados;
- as três simulações, com os resumos abaixo.

| Simulação | Status | Chamadas / ferramentas | Tokens | `chamadasSemUso` | HTTP |
|---|---|---|---|---|---|
| uso completo | sucesso | 2 / 1 | 390 / 43 | 0 | 200 |
| `sem-uso` | sucesso | 2 / 1 | 180 / 25 | 1 | 200 |
| `falha-na-segunda` | falha | 2 / 1 | 180 / 25 | 1 | 500 `ERRO_INTERNO` |

Os 35 testes se dividem assim:

- **Unitários, sem HTTP e sem modelo:**
  - `observabilidade.test.ts` (5): relógio, extração de uso, diagnóstico sem
    a mensagem, níveis de emissão e contadores independentes;
  - `banco.test.ts` (8): os testes de banco do módulo 13.
- **`app.inject` com modelo simulado** (Fastify dentro do processo, sem rede):
  - `cobertura-do-uso.test.ts` (3): uso completo, uso ausente numa resposta
    bem-sucedida e falha sem uso, com correlação, contadores e HTTP;
  - `log-de-erro.test.ts` (1): o log do tratador geral, descrito acima;
  - `app.test.ts` (6), `ferramentas.test.ts` (5), `persistencia.test.ts` (4)
    e `falha.test.ts` (3): herdados do módulo 13.

**De etapas anteriores:**

- **Caminhos de falha**, com `app.inject` por um roteiro temporário fora do
  módulo: com a segunda chamada falhando com um erro do SDK (503) e com a
  ferramenta de políticas falhando, os eventos de falha e o resumo saíram em
  `warn` com o código seguro, a resposta continuou `500`, e o texto da
  mensagem do erro não apareceu nos eventos.
- **HTTP pela rede e navegador:** a execução real com a Groq, descrita acima,
  feita pelo aluno pelo navegador; a resposta exibida foi conferida por
  captura de tela.
- **Relatado pelo aluno:** a execução de `npm run simular -- falha-na-segunda`
  descrita na investigação.

O build e o lint do frontend não foram executados neste módulo.

## Limitações

- **Uma execução real.** Não permite avaliar estabilidade nem variação das
  durações.
- **Trechos sem medição** não têm causa de duração identificada, como os
  cerca de 51 ms do cenário real.
- **Log de sucesso não é resposta correta.** Os eventos mostram o fluxo, não
  a correção semântica da resposta.
- **Consumo desconhecido.** Uma chamada que falha sem uso deixa o consumo
  dessa tentativa desconhecido; `chamadasSemUso` indica a falta, mas não a
  estima.
- **Só a rota de mensagens é instrumentada.** A criação de conversa e a
  confirmação aparecem apenas nas linhas padrão do Fastify. Um texto inválido
  (400) é recusado antes do início da medição e não gera resumo.
- **Leitura e gravação do histórico** entram na duração total, sem evento
  próprio.
- **`usoSimulado`** é um único indicador para a rodada: não diz quais
  chamadas foram simuladas, o que os eventos de cada chamada mostram.
- **Sem cálculo monetário, dashboard, retenção de logs, tracing distribuído
  ou estudo de carga.** Os eventos existem só na saída do processo.
- **Comentários `TODO`** continuam no código, embora implementados.
