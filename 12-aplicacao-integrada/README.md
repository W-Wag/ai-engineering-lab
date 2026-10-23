# 12-aplicacao-integrada

## Objetivo

Integrar, numa aplicação de chat, os temas estudados nos módulos anteriores:
conversa com histórico, consulta a documentos e proposta de agendamento com
confirmação. O foco é a divisão de responsabilidades:

- **modelo:** interpreta o pedido e decide quais ferramentas chamar;
- **backend:** guarda o histórico, executa as ferramentas, valida e grava;
- **frontend:** apresenta mensagens, fontes e propostas, e inicia a
  confirmação.

O módulo foi construído em três blocos: conversa e histórico, consulta de
políticas, e proposta com confirmação.

Fluxo de um agendamento:

```text
pergunta → decisão do modelo → proposta → confirmação na interface
→ validação no backend → gravação ou reutilização → resultado
```

Todos os dados são fictícios.

## Visão geral

### Stack

- **Frontend:** React 19, Vite 8 e TypeScript, criado com o template
  `react-ts` do `create-vite`. Estilos em CSS puro, sem biblioteca visual.
- **Backend:** Fastify 5 e TypeScript, executado com `tsx`.
- **Modelo:** Groq, com `openai/gpt-oss-20b`, pelo `groq-sdk`, com uma
  tentativa por chamada e sem retries.
- **Embeddings:** locais, com `Xenova/multilingual-e5-small` pelo
  `@huggingface/transformers`, reutilizados do módulo 06.

### Organização

```text
12-aplicacao-integrada/
  backend/src/
    server.ts          servidor real (porta 3001), com a Groq
    app.ts             rotas, contratos HTTP e erros
    conversas.ts       histórico por conversa, trava e laço de rodadas
    rodada.ts          uma chamada ao modelo e execução das ferramentas
    groq.ts            chamada real ao modelo
    ferramentas.ts     definições, validação e despacho das ferramentas
    instrucoes.ts      instruções de sistema da aplicação
    politicas.ts       ranking e busca no manual fictício
    agendamentos.ts    propostas, confirmação e reservas
    test/              testes com modelo simulado
  frontend/src/
    App.tsx            estado da página, envio e confirmação
    api.ts             cliente HTTP tipado
    componentes.tsx    componentes de apresentação
```

O backend reutiliza, sem alterá-los, código dos módulos anteriores:

| Módulo | O que é reutilizado |
|---|---|
| 03 | `consultarDisponibilidade` |
| 04 | definição da ferramenta de disponibilidade (`criarFerramentas`) |
| 06 | embeddings locais e similaridade, por meio do 08 |
| 07 | `lerDocumento` e `dividirPorSecoes`, com o manual fictício |
| 08 | `ranquearTrechos` |
| 09 | sessão simulada, `verificarFormato`, `verificarSolicitacao` e `gravarAgendamento` |
| 10 | `montarChaveOperacao`, `consultarOperacao` e `registrarOperacao` |

### Configuração e execução

O módulo é executado com Node pelo WSL. A chave da Groq fica no arquivo `.env`
da raiz do repositório, na variável `GROQ_API_KEY`, lida apenas pelo backend
por meio de `shared/env.ts`. Nenhuma credencial vai para o frontend, e não há
variáveis `VITE_*`.

Como o backend importa código de outros módulos, as dependências deles também
precisam estar instaladas:

```bash
(cd 04-contexto && npm install)
(cd 06-embeddings && npm install)
(cd 12-aplicacao-integrada/backend && npm install)
(cd 12-aplicacao-integrada/frontend && npm install)
```

Execução, em dois terminais:

```bash
# backend, porta 3001
cd 12-aplicacao-integrada/backend
npm run dev        # ou npm start, sem recarregar ao salvar

# frontend, porta 5173
cd 12-aplicacao-integrada/frontend
npm run dev
```

Em desenvolvimento, o navegador fala só com o Vite, que repassa as rotas
`/conversas` ao backend por proxy.

Verificações:

```bash
cd 12-aplicacao-integrada/backend
npm run typecheck
npm test

cd 12-aplicacao-integrada/frontend
npm run typecheck
npm run build
npm run lint
```

### O que usa a Groq

- **Usa a Groq:** cada mensagem válida enviada. Uma mensagem pode gerar mais
  de uma chamada ao modelo, quando há ferramentas, até 4 rodadas.
- **Executa localmente, sem a Groq:**
  - criação de conversa;
  - mensagens rejeitadas por validação, conversa inexistente ou conversa
    ocupada;
  - consulta de disponibilidade e preparação de propostas, dentro do
    processamento da mensagem;
  - busca nas políticas, com embeddings gerados na máquina. Na primeira
    execução, o modelo de embeddings pode precisar ser baixado (cerca de
    113 MB) para o cache do módulo 06;
  - confirmação de propostas;
  - os testes automatizados, com modelo simulado.

## Bloco 1 — Conversa e histórico

### Contratos

| Rota | Entrada | Sucesso |
|---|---|---|
| `POST /conversas` | — | `201 { conversaId }` |
| `POST /conversas/:conversaId/mensagens` | `{ texto }` | `200 { resposta, fontesConsultadas, propostas }` |

Todo erro tem o formato `{ erro: { codigo, mensagem } }`:

| Código | Status | Quando |
|---|---|---|
| `TEXTO_INVALIDO` | 400 | texto ausente ou vazio |
| `REQUISICAO_INVALIDA` | 400 | JSON malformado |
| `CONVERSA_NAO_ENCONTRADA` | 404 | conversa inexistente |
| `CONVERSA_OCUPADA` | 409 | outra operação em andamento na conversa |
| `SEM_RESPOSTA` | 502 | modelo sem resposta em texto |
| `LIMITE_DE_RODADAS` | 502 | limite de rodadas atingido |
| `ERRO_INTERNO` | 500 | qualquer outra falha |

Falhas não previstas viram `ERRO_INTERNO` genérico. Detalhes e stack ficam só
no log do servidor.

### Responsabilidades

- **Frontend:** cria a conversa ao abrir a página, guarda o `conversaId` e, a
  cada envio, manda só o texto novo com esse identificador. Guarda apenas as
  mensagens necessárias à apresentação.
- **Backend:** mantém o histórico de cada conversa (instruções, usuário,
  assistente e ferramentas) e o envia ao modelo a cada rodada. O histórico só
  é atualizado quando há resposta final; em caso de falha, a conversa fica
  como estava antes da mensagem.

O frontend mostra a mensagem do usuário assim que ela é enviada. Isso não
comprova que o backend a processou. Em caso de falha, a interface mostra o
erro e não cria uma resposta fictícia do assistente.

### Estados na interface

- **Carregamento:** cobre a criação da conversa e cada envio.
- **Bloqueio:** o formulário fica bloqueado enquanto carrega ou quando não há
  conversa, inclusive por Enter.
- **Erro:** aparece numa área própria.
- **Sem reenvio automático:** um erro de comunicação não prova que o backend
  deixou de processar o pedido.

### Memória e isolamento

- As conversas ficam em memória, separadas pelo `conversaId`.
- Uma trava impede processar duas operações ao mesmo tempo na mesma conversa
  e é liberada também em caso de erro. Outras conversas não são afetadas.
- O protótipo tem um único usuário simulado. O `conversaId` identifica a
  conversa, mas não seria suficiente para autorizar acesso em produção.

## Bloco 2 — Consulta de políticas

### Recuperação

A ferramenta `consultarPoliticas` recebe uma consulta em texto, não vazia.
O backend:

1. lê o manual fictício do módulo 07 (`manual-atendimento.md`) e o divide por
   seções;
2. ranqueia os trechos com embeddings locais (`ranquearPoliticas`);
3. seleciona o primeiro colocado (`buscarPoliticas`), tratando ranking vazio.

A seleção do primeiro colocado é uma simplificação: a posição no ranking não
garante que o trecho tenha informação suficiente. Não há limiar de
pontuação.

O trecho devolvido ao modelo preserva conteúdo, fonte e seção, e é marcado
como conteúdo de referência. As instruções orientam o modelo a afirmar regras
só com base nesses trechos, a considerar exceções, a admitir quando o trecho
não permite responder e a não tratar ausência de informação como
inexistência de uma regra. Os trechos não alteram instruções nem concedem
permissões.

### Fontes consultadas

`fontesConsultadas` lista fonte e seção dos trechos recuperados pela
ferramenta durante aquela mensagem:

- vêm dos resultados da busca no backend, não do texto do modelo;
- começam vazias a cada mensagem e não passam para outras mensagens ou
  conversas;
- fonte e seção repetidas aparecem uma vez;
- trazem só o nome do arquivo, sem caminho.

Na interface, as fontes ficam junto à resposta correspondente, como texto e
sem links.

Uma fonte recuperada não é o mesmo que uma fonte que sustenta a resposta. A
lista mostra o que foi consultado; não garante que cada afirmação da resposta
esteja nesse trecho.

### Casos

- **Cancelamento pela clínica.** O trecho da seção `Cancelamento` contém a
  regra (taxa de R$ 30 com menos de 24 horas de antecedência) e a exceção
  (não se aplica quando a clínica cancela). Como regra e exceção ficam no
  mesmo trecho, o modelo pode aplicar a exceção.
- **Desconto por Pix.** O manual não trata de pagamentos. A busca ainda
  devolve um primeiro colocado, mas recuperar um trecho não garante que exista
  informação suficiente. O esperado é o modelo informar que o trecho não
  responde, sem concluir que a clínica não oferece desconto. Esse caso foi
  investigado no módulo 08; não foi executado neste módulo.

## Bloco 3 — Proposta, confirmação e execução

### Preparação da proposta

A ferramenta `prepararPropostaAgendamento` recebe `profissionalId`, `data` e
`horario`. Não existe argumento de cliente: o cliente é sempre o usuário da
sessão simulada. Campos extras enviados pelo modelo, como `cliente` ou
`confirmado`, são ignorados.

O backend:

1. valida o formato e a disponibilidade, descontando horários já reservados;
2. cria a proposta em memória, com identificador próprio, vinculada ao
   usuário e à conversa;
3. guarda uma cópia congelada dos dados e uma chave de operação estável,
   `proposta-<propostaId>`;
4. **não grava agendamento**.

Se os dados forem inválidos ou o horário estiver indisponível, o modelo
recebe o motivo e nenhuma proposta chega à interface.

O modelo não recebe ferramenta para confirmar ou gravar. Um "sim" no chat não
equivale à confirmação: as instruções orientam o modelo a direcionar o
usuário ao botão e a não afirmar que o agendamento foi criado.

As propostas da mensagem chegam em `propostas`, cada uma com `propostaId`,
`profissional`, `data`, `horario` e `estado: "aguardando_confirmacao"`.
Elas vêm dos resultados da ferramenta, nunca do texto do modelo. Duas
propostas na mesma mensagem aparecem como dois itens.

### Card e confirmação na interface

Cada proposta vira um card com profissional, data, horário e o botão
"Confirmar agendamento". O estado de cada proposta fica no frontend, separado
por `propostaId`:

- `pendente`: ainda não confirmada;
- `enviando`: aguardando o backend;
- `erro`: a tentativa falhou; o botão vira "Tentar confirmar novamente", com
  a mesma proposta;
- `concluida`: o backend confirmou.

O sucesso exibido no card vem da resposta do endpoint de confirmação, não do
texto do modelo. Não há reenvio automático.

### Endpoint de confirmação

`POST /conversas/:conversaId/propostas/:propostaId/confirmar`

A interface envia só os identificadores. Cliente, data e horário vêm da
proposta guardada no backend, e o corpo da requisição é ignorado. A
confirmação não chama a Groq.

O backend:

1. verifica se a proposta existe e pertence ao usuário e à conversa;
2. registra a confirmação dos dados exatos da proposta e aplica os controles
   do módulo 09;
3. consulta a chave da operação no registro do módulo 10. Se já foi
   concluída, devolve o mesmo agendamento como `reutilizado`, sem gravar;
4. senão, revalida a disponibilidade, grava, reserva o horário, registra a
   operação e devolve `criado`.

Sucesso:

```ts
{
  resultado: "criado" | "reutilizado";
  agendamento: { id: number; profissional: string; data: string; horario: string };
}
```

Erros, no mesmo formato do bloco 1:

| Código | Status | Quando |
|---|---|---|
| `CONVERSA_NAO_ENCONTRADA` | 404 | conversa inexistente |
| `PROPOSTA_NAO_ENCONTRADA` | 404 | proposta inexistente ou de outra conversa ou usuário |
| `CONVERSA_OCUPADA` | 409 | uma mensagem está em processamento na conversa |
| `HORARIO_INDISPONIVEL` | 409 | horário reservado por outra proposta |
| `CONFIRMACAO_BLOQUEADA` | 403 | controles do módulo 09 |

`CONFIRMACAO_BLOQUEADA` dificilmente ocorre neste fluxo, porque o cliente da
proposta é sempre o usuário da sessão. O controle está presente como defesa.

### Idempotência e conflito de horário

São controles distintos:

- **Idempotência:** a mesma proposta, confirmada de novo, devolve o mesmo
  agendamento. A chave é criada junto com a proposta, não a cada clique ou
  requisição. Uma confirmação repetida não é rejeitada pelo horário que a
  própria proposta ocupou.
- **Conflito de horário:** propostas diferentes para o mesmo horário não
  geram duas reservas. A segunda confirmação recebe `HORARIO_INDISPONIVEL`.
  A confirmação é síncrona, sem `await` entre a verificação final e a
  gravação, o que impede a intercalação de duas confirmações no mesmo
  processo.

### Resultado no histórico

Quando uma confirmação cria o agendamento, o backend acrescenta ao histórico
da conversa uma mensagem `system` que começa com "Registro da aplicação:",
com a proposta, o ID e os dados. Ela não simula uma chamada de ferramenta e
não usa `tool_call_id`. As instruções do modelo explicam que esse prefixo
indica confirmações já realizadas pelo botão.

A confirmação usa a mesma trava das mensagens da conversa.

## Evidências

Os registros abaixo são da etapa anterior, de preparação e conferência dos
blocos. Nenhuma verificação foi executada durante a escrita desta
documentação.

### Testes automatizados

Os testes do backend usam `app.inject` do Fastify, que exercita rotas,
validação e tratamento de erros dentro do processo, sem conexão de rede real.
O modelo é simulado, e nenhum teste chama a Groq. A consulta de
disponibilidade, a gravação do módulo 09 e o registro do módulo 10 são os
reais.

Na última conferência, os 17 testes passaram. Eles cobrem:

- **Bloco 1:**
  - contrato e validação;
  - isolamento entre conversas;
  - trava com 409 e liberação após falha;
  - erro genérico sem detalhes internos;
  - histórico preservado em falha;
  - resposta ausente nunca tratada como sucesso.
- **Bloco 2:**
  - definição e validação de `consultarPoliticas`;
  - associação ao `tool_call_id`;
  - fonte sem caminho;
  - fontes por mensagem, sem duplicação nem vazamento;
  - erros da ferramenta preservando o contrato;
  - ranking com embeddings locais retornando os três trechos do manual.

  A busca nesses testes é simulada e não exercita a implementação de
  `buscarPoliticas`.
- **Bloco 3:**
  - preparar não grava;
  - propostas por mensagem, em lista;
  - argumentos extras ignorados;
  - confirmação criando uma vez e repetição reutilizando o mesmo ID;
  - corpo da requisição sem efeito;
  - registro da aplicação no histórico, sem `tool_call_id`;
  - rejeição de proposta de outra conversa, inexistente ou de outro usuário;
  - uma reserva só para o mesmo horário;
  - respeito à trava da conversa.

### Verificações estáticas, build e lint

Na última conferência:

- typecheck do backend sem erros;
- build do frontend concluído;
- lint do frontend sem erros, com 3 avisos sobre a ordem do `useEffect` em
  relação aos `useState` em `App.tsx`.

Durante a preparação, o backend real foi iniciado com o Vite, e a criação de
conversa e os erros 400 e 404 foram conferidos pelo proxy, sem chamar a
Groq. O código servido ao navegador e o build não continham a chave.

### Execuções relatadas no navegador e por curl

Execuções relatadas, sem reexecução:

- **Bloco 1:**
  - o cenário de horários funcionou de ponta a ponta;
  - o modelo pediu a data no formato `YYYY-MM-DD` antes de consultar, em vez
    de interpretar "20 de outubro de 2026";
  - o bloqueio do formulário durante o envio foi observado com a rede
    desacelerada no DevTools.
- **Bloco 2:**
  - a pergunta "A clínica cancelou meu atendimento duas horas antes. Preciso
    pagar a taxa?" foi respondida aplicando a exceção, com a fonte
    `manual-atendimento.md — seção Cancelamento`;
  - uma pergunta seguinte, sobre horários, não herdou essa fonte;
  - a resposta mencionou "o paciente", termo que não está no manual: a
    conclusão estava certa, mas essa parte foi inferência do modelo.
- **Bloco 3:**
  - a proposta para Ana, 2026-10-20, 09:00 foi exibida no card, e o modelo
    indicou que ela aguardava a confirmação. O clique criou o agendamento,
    com "Agendamento criado (ID 1)";
  - a repetição da confirmação por `curl` devolveu `"resultado":"reutilizado"`
    com o mesmo ID 1;
  - sem reiniciar o backend, um novo pedido para o mesmo horário foi recusado
    por indisponibilidade, e nenhuma proposta foi criada;
  - com o backend desligado, a confirmação mostrou o erro 502 do proxy e o
    botão de nova tentativa, sem falso sucesso;
  - um "sim" no chat não criou agendamento: o modelo orientou o uso do botão;
  - após reiniciar o backend, a nova tentativa retornou "Conversa não
    encontrada", porque conversas e propostas estavam em memória.

### Cenários não executados

- caso de desconto por Pix neste módulo;
- duas propostas na mesma resposta, no navegador;
- nova tentativa concluída com sucesso depois de um erro, com o backend no
  ar;
- concorrência entre vários processos.

## Limitações

- Usuário simulado (`joao`), sem autenticação real.
- Conversas, propostas, reservas e registros de idempotência ficam em
  memória. Reiniciar o backend perde esses dados.
- Depois de um reinício do backend, a página aberta continua com o
  `conversaId` antigo e só volta a funcionar após ser recarregada.
- A proteção contra reserva dupla vale para um processo; não há garantia
  distribuída nem persistente.
- Se uma mensagem falhar depois de preparar uma proposta, a proposta fica em
  memória sem chegar à interface.
- Sem edição, cancelamento ou expiração de propostas, e sem integração com
  agenda externa.
- As datas usadas, como 2026-10-20, são dados fixos do exercício; não
  representam reservas reais nem a data corrente.
- Sem streaming. As respostas do modelo podem conter Markdown, exibido como
  texto puro.
- Os comentários `TODO` dos exercícios continuam no código, embora
  implementados.

## Próximo estudo

Persistência e recuperação do estado.
