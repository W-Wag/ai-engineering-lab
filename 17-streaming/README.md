# 17-streaming

## Objetivo

Mostrar um texto à medida que ele é gerado, permitir que o usuário interrompa
a geração e deixar claro em que situação a geração está:

| Estado | Quando |
|---|---|
| aguardando | a requisição foi feita e nenhum fragmento chegou ainda |
| recebendo | pelo menos um fragmento chegou |
| concluído | chegou o evento `concluido` |
| interrompido | o usuário clicou em "Parar" |
| erro | houve falha no servidor ou no transporte |

Depois de uma interrupção ou de uma falha, o texto parcial continua visível.
Na interrupção, a tela mostra "Texto parcial: a geração foi interrompida
antes do fim."; no erro, mostra a mensagem do erro seguida de "O texto acima
está incompleto.".

## Arquitetura

```text
navegador (React) ──fetch──▶ Vite (proxy /geracoes) ──▶ Fastify ──▶ produtor simulado
             ◀── NDJSON, um evento por linha, enviado aos poucos ──
```

- **Frontend:** React com TypeScript, servido pelo Vite. Em desenvolvimento,
  o Vite repassa `/geracoes` ao backend.
- **Backend:** Fastify com TypeScript, na porta 3001.
- **Produtor simulado:** devolve um texto fixo, palavra por palavra. Espera
  1,2 s antes do primeiro fragmento e 250 ms entre os seguintes.

Não há modelo de IA, credenciais, banco de dados nem ferramentas executáveis.

```text
17-streaming/
  backend/src/
    protocolo.ts        contrato NDJSON (tipos dos eventos e regras)
    produtor.ts         texto fixo, espera cancelável, produtor simulado
    app.ts              POST /geracoes, desconexão e logs
    server.ts           porta 3001; flag --fluxo-incompleto
    test/               produtor, app.inject, HTTP pela rede
  frontend/src/
    ndjson.ts           leitor incremental de linhas e UTF-8
    cliente.ts          transmitirGeracao(signal) → eventos tipados
    estado.ts           nomes dos estados
    componentes.tsx     Painel: botões, estado, texto, marcas
    App.tsx             lógica de estado (implementada por Wagner)
    main.tsx            escolhe entre App normal e página da investigação
    investigacao/       transporte simulado e página do cenário 1
  frontend/test/        leitor NDJSON e cliente com fetch falso
```

### Preparado pelo assistente

- Configuração dos dois pacotes, com proxy do Vite, typecheck, lint e testes.
- O protocolo, o produtor simulado e a rota com detecção de desconexão e
  logs.
- O leitor NDJSON, o cliente HTTP, o tipo dos estados e o painel de
  apresentação.
- Os mecanismos da investigação:
  - o ponto de injeção do transporte no App;
  - o transporte simulado e a página do cenário 1;
  - o modo de fluxo incompleto do backend.

### Implementado por Wagner, em `App.tsx`

A lógica de estado, o acúmulo do texto, a identidade de cada execução e o
cancelamento. Os detalhes estão na seção
[Implementação do aluno](#implementação-do-aluno).

## Protocolo e transporte

**Contrato.** `POST /geracoes` responde com status 200, tipo
`application/x-ndjson; charset=utf-8` e o cabeçalho `x-execucao`. O corpo é
uma sequência de objetos JSON, um por linha:

| Evento | Campos | Significado |
|---|---|---|
| `delta` | `execucao`, `indice`, `texto` | um fragmento de texto |
| `concluido` | `execucao`, `fragmentos` | a geração terminou normalmente |
| `erro` | `execucao`, `codigo`, `mensagem` | falha segura; o detalhe interno fica só no log |

**Regras do fluxo:**

- **Fim do fluxo normal:** o servidor envia zero ou mais `delta` e termina
  com exatamente um evento final, `concluido` ou `erro`.
- **Status 200:** é enviado antes do primeiro fragmento e não muda depois.
  Por isso ele não garante que a geração vai terminar: uma falha posterior
  aparece como `erro` no protocolo.
- **Evento final não garantido:** se a conexão cair, o evento final pode
  nunca chegar. Um fluxo que fecha sem `concluido` nem `erro` é tratado como
  falha, nunca como sucesso.

**Eventos de transporte.** O cliente (`transmitirGeracao`) entrega ao App os
eventos do servidor e mais dois, que ele mesmo gera:

- **`cancelado`:** o `AbortSignal` foi abortado pelo próprio App. Esse
  cancelamento local é diferente de uma falha.
- **`falha_no_transporte`:** o cliente percebeu um problema. O campo
  `motivo` informa qual:
  - `http`: status diferente de 200;
  - `rede`: a conexão falhou sem cancelamento local;
  - `protocolo`: linha inválida ou `execucao` trocada no meio do fluxo;
  - `sem_evento_terminal`: o fluxo fechou sem evento final.

**Fragmentos de rede.** Um pedaço de bytes recebido pela rede não equivale a
um evento, a uma palavra ou a um token. Uma linha pode chegar dividida em
vários pedaços, e vários eventos podem chegar num pedaço só. Um caractere
UTF-8 de 2 a 4 bytes, como "ç", "☕" ou "🍫", pode ser cortado no meio.

O leitor (`ndjson.ts`) usa `TextDecoder` em modo contínuo e acumula o texto
até encontrar o `\n` que fecha a linha. Depois disso, confere o formato de
cada evento.

**Tipos compartilhados.** `backend/src/protocolo.ts` é a única fonte do
contrato. O frontend importa os tipos de lá com `import type`.

## Implementação do aluno

- **Início da execução:** cada clique em "Gerar" incrementa um contador
  (`useRef`) e guarda uma cópia local em `minhaExecucao`. A tela é limpa e o
  estado vai para "aguardando".
- **Dois identificadores:**
  - `minhaExecucao` é um **identificador local da interface**: só diz qual
    clique está ativo na tela;
  - `execucao`, que vem nos eventos e no cabeçalho `x-execucao`, é o
    **identificador da requisição no backend** e serve para correlacionar os
    logs.
- **Acúmulo do texto:** cada `delta` é acrescentado com
  `setTexto(anterior => anterior + evento.texto)`, a forma com função do
  setter. Ela evita usar o valor de `texto` capturado no momento do clique, e
  o estado passa para "recebendo".
- **Conclusão:** o estado só vai para "concluido" no evento `concluido`. O
  fim do laço de leitura não é tratado como sucesso.
- **Interrupção:** o "Parar" chama `abort()` no `AbortController` guardado em
  `controladorAtivo`. Quando o evento `cancelado` chega, o estado vai para
  "interrompido", sem mexer no texto.
- **Erro:** `erro` e `falha_no_transporte` levam ao estado "erro", com
  mensagem e com o texto parcial preservado.
- **Identidade da execução:** antes de tratar qualquer evento, o laço confere
  `minhaExecucao !== idDaExecucao.current`. Se a execução não for mais a
  ativa, sai com `return` e para de ler.
- **Limpeza:** ao fim da leitura, o controlador só é apagado se
  `controlador === controladorAtivo.current`.
- **Desmontagem:** um `useEffect` aborta a execução em andamento quando o
  componente sai da tela.

Wagner optou por não registrar previsões durante a construção.

## Cancelamento

Quando o usuário clica em "Parar":

1. o navegador interrompe a requisição;
2. no backend, o evento `close` da resposta chega antes do fim
   (`writableFinished` falso), e isso é registrado como desconexão prematura
   ("conexão encerrada antes do fim; cancelando o produtor");
3. o `AbortController` da rota cancela o produtor simulado, e a espera em
   andamento é rejeitada;
4. a espera cancelável (`esperar`) limpa o timer e remove o listener do
   `signal`, e a rota remove o listener de `close`.

**Limites:**

- **Interface:** parar de exibir o texto não comprova que todo o
  processamento parou.
- **Alcance:** a propagação do cancelamento foi observada só neste produtor
  local. Não houve validação com um provedor real, que poderia continuar
  gerando ou cobrando.
- **Operações já confirmadas:** cancelar não desfaz operações já
  confirmadas. Este exercício não tem gravações persistentes.

## Construção e evidências

O Wagner testou no navegador e relatou:

- o texto cresce aos poucos;
- o "Parar" mantém o texto parcial, com a marca de interrupção;
- uma nova geração começa com a área de texto limpa;
- a geração conclui normalmente.

O log do backend dessa sessão foi analisado pelo assistente e mostrou
**duas** requisições:

- **Requisição interrompida:** 12 fragmentos, seguidos dos registros de
  desconexão prematura e de cancelamento do produtor.
- **Requisição concluída:** a nova geração, iniciada depois da interrupção,
  teve 47 fragmentos e terminou com "encerrada normalmente".

A conclusão normal tem evidência no log por meio dessa segunda requisição. Não
houve uma terceira execução separada.

## Investigação 1: execução anterior

**Montagem:**
- o App real recebe uma prop opcional `transmitir`, que por padrão é o cliente
  HTTP real;
- a página `?cenario=execucao-anterior` passa um **transporte simulado** e
  mostra botões de comando, a indicação de qual controlador foi abortado e um
  registro numerado dos passos;
- a lógica de estado do Wagner não foi alterada.

A simulação controla a ordem dos acontecimentos com comandos explícitos.
Depois de entregar `cancelado` para a execução A, ela segura de propósito uma
notificação de A para liberá-la mais tarde. O cliente real não produziria essa
notificação dessa forma. Esta investigação **não** é uma corrida observada na
rede real.

**Sequência 1a:** A é cancelada, B começa, e um delta atrasado de A é
liberado.

- **Registro:** A liberou a notificação atrasada, e em seguida a interface
  parou de ler A, antes do fim do fluxo.
- **Tela:** o texto e o estado de B não mudaram. O "Parar" levou B a
  "Interrompido pelo usuário".
- **Proteção exercitada:** a conferência de identidade, seguida de `return`.
  O `return` encerra a leitura de A **antes** de chegar à limpeza do
  controlador, então a limpeza não foi exercitada nesta sequência.

**Sequência 1b:** depois que B começa, A termina sem entregar nenhum evento.

- **Registro:** "A encerrou a rotina sozinha". Depois, "B recebeu o abort do
  seu controlador".
- **Proteção exercitada:** a limpeza condicionada.
  - **Sem evento, sem conferência:** como A não entregou nenhum evento, a
    conferência de identidade não foi usada.
  - **A limpeza:** o laço de A chegou à limpeza, mas o controlador guardado
    era o de B. A comparação deu falso, e o controlador de B não foi apagado.
  - **O efeito na tela:** o "Parar" continuou cancelando B. Se A tivesse
    limpado o controlador sem conferir, o `parar()` encontraria `null`.

**Por que duas sequências:** cada uma passa por um caminho diferente do
código. Na 1a, a execução antiga sai cedo pela conferência de identidade. Na
1b, ela termina sem eventos e só chega à limpeza. Uma única sequência não
exercitaria as duas proteções.

## Investigação 2: fluxo incompleto

**Montagem:** o modo `npm run start:incompleto` (flag `--fluxo-incompleto`)
envia 6 deltas e fecha a resposta HTTP de forma regular, sem `concluido` e sem
`erro`. É um fechamento controlado da resposta, que simula uma violação do
protocolo. **Não** é uma queda real de rede.

**Resultado relatado por Wagner:**

- **Estado e mensagem:** a tela mostrou o estado "erro", com
  `sem_evento_terminal: o fluxo terminou sem "concluido" nem "erro"` e o
  complemento "O texto acima está incompleto.".
- **Texto parcial:** permaneceu na tela.
- **Volta ao modo normal:** com o backend em `npm start`, uma nova geração
  terminou normalmente.

Na discussão das previsões, Wagner chamou primeiro esse caso de
"interrompido". A distinção foi esclarecida:

| Origem | Estado |
|---|---|
| cancelamento pedido pelo usuário | interrompido |
| encerramento inesperado do fluxo | erro |
| evento `concluido` | concluído |

## Execução

### Instalação

Na raiz do repositório:

```powershell
npm install --prefix 17-streaming/backend
npm install --prefix 17-streaming/frontend
```

### Modo normal

Use dois terminais:

```powershell
# terminal 1: backend na porta 3001
cd 17-streaming/backend
npm start
```

```powershell
# terminal 2: frontend em http://localhost:5173
cd 17-streaming/frontend
npm run dev
```

### Investigação 1

Abra http://localhost:5173/?cenario=execucao-anterior

Basta o frontend; o backend não é usado. Para recomeçar a sequência, recarregue
a página.

### Investigação 2

No terminal do backend, pare o servidor (Ctrl+C) e rode:

```powershell
npm run start:incompleto
```

Para voltar ao modo normal, pare o servidor de novo e rode `npm start`. Só o
backend precisa ser reiniciado ao trocar de modo; o Vite pode continuar
rodando. Use o frontend em http://localhost:5173, sem o parâmetro `?cenario`.

### Verificações

Em cada pasta:

```powershell
npm run typecheck
npm test
```

E também, no frontend:

```powershell
npm run lint
```

## Verificações

Estas verificações foram feitas durante a construção e a investigação.

### Testes automatizados

O backend tem 10 testes:

| Grupo | Quantos | O que cobre |
|---|---|---|
| Produtor (`produtor.test.ts`) | 5 | os fragmentos reconstroem o texto; a espera não deixa listener pendente; o cancelamento interrompe o produtor; a falha simulada acontece no ponto pedido |
| app.inject (`app.test.ts`) | 3 | geração normal; falha com status 200 terminando em `erro`, sem vazar detalhe interno; fluxo incompleto, com 6 deltas e sem evento final |
| HTTP pela rede (`transporte.test.ts`) | 2 | os pedaços chegam espaçados no tempo; o abort cancela o produtor e registra a desconexão |

O frontend tem 13 testes:

| Grupo | Quantos | O que cobre |
|---|---|---|
| Leitor NDJSON (`ndjson.test.ts`) | 7 | linha dividida em pedaços; vários eventos num pedaço; fim de um evento e começo do próximo juntos; emoji de 4 bytes cortado; um byte por vez; linha incompleta no fim; linhas inválidas |
| Cliente com fetch falso (`cliente.test.ts`) | 6 | fluxo normal; fechamento sem evento final; status 503; `execucao` trocada; cancelamento antes e durante a leitura |

Resultado final: os 10 testes do backend e os 13 do frontend passaram, e o
typecheck dos dois pacotes e o lint do frontend não acusaram erros.

O app.inject entrega o corpo inteiro de uma vez. Ele não comprova chegada
progressiva nem desconexão real.

### Verificações pela rede, fora da suíte

Foram feitas pelo assistente com scripts temporários:

- **Pelo proxy do Vite, na preparação:**
  - fluxo completo: o primeiro fragmento chegou em cerca de 1,2 s e o último
    em cerca de 13 s;
  - abort depois de 4 linhas: o log mostrou 4 fragmentos escritos e depois a
    desconexão.
- **Fluxo incompleto:** o app subiu numa porta aleatória e o fluxo foi lido
  com o `transmitirGeracao` real. Chegaram 6 deltas e depois
  `falha_no_transporte` com o motivo `sem_evento_terminal`. O log registrou o
  encerramento sem evento final.

### Execução manual no navegador

O Wagner relatou:

- **Construção:** os fluxos descritos em
  [Construção e evidências](#construção-e-evidências).
- **Investigação 1:** os registros das sequências 1a e 1b foram analisados
  pelo assistente a partir de capturas de tela.
- **Investigação 2:** o backend rodava no terminal do Wagner, e esse log não
  foi analisado pelo assistente.

O App não tem testes automatizados: o comportamento dele foi verificado
manualmente.

## Limitações

- O texto gerado e o transporte da investigação 1 são simulados.
- Não há provedor real de IA.
- Não houve teste de queda real de rede nem de falha do proxy.
- Não há persistência, autenticação, novas tentativas automáticas nem
  Markdown avançado.
- O backend não controla a pressão de escrita, isto é, o caso em que o
  cliente lê mais devagar do que o servidor escreve.
- A interface, que é didática, mostra detalhes técnicos do erro, como
  `sem_evento_terminal` e o código do servidor.
- O comportamento do App foi verificado manualmente, sem uma suíte
  automatizada.
