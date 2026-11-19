# 18-autorizacao

## Objetivo

Construir uma aplicação local pequena, com duas contas fictícias (Ana e
Carlos) e conversas individuais, em que cada pessoa só lista, abre e usa as
próprias conversas.

### Conceitos

- **Autenticação** estabelece quem é o usuário.
- **Autorização** decide se esse usuário pode fazer uma ação sobre um recurso
  específico.
- **Isolamento** garante que ninguém acesse os dados de outra conta.
- **A identidade vem da sessão** validada pelo backend. Um `userId` enviado no
  corpo da requisição não comprova nada.
- **Um ID não é uma permissão.** Conhecer o ID de uma conversa não dá acesso a
  ela: o ID diz qual recurso foi pedido, não se quem pediu pode usá-lo.
- **A autorização vem antes do modelo.** Primeiro se decide o acesso; só
  depois as mensagens podem ser enviadas ao modelo.
- **Esconder não protege.** Ocultar um recurso na interface não protege o
  endpoint: qualquer pessoa pode chamar a rota diretamente.

## Arquitetura

```text
navegador (React) ──▶ Vite (proxy /sessao e /conversas) ──▶ Fastify ──▶ SQLite em memória
                                                                  └──▶ modelo simulado
```

- **Backend:** Fastify com TypeScript, na porta 3001.
- **Banco:** SQLite (`node:sqlite`) em memória. Cada vez que o servidor
  inicia, o banco é recriado com as fixtures.
- **Frontend:** React com Vite. O proxy repassa as rotas ao backend, então o
  navegador fala com uma única origem.
- **Contas:** duas contas fictícias de demonstração local.
- **Modelo simulado:** devolve uma resposta determinística, sem API de IA. Os
  contadores de observação (`modelo.observacao`) ficam só em memória, e
  nenhuma rota de diagnóstico os expõe.

```text
18-autorizacao/
  backend/src/
    tipos.ts          UsuarioAutenticado, Conversa, Mensagem, ErroHttp
    senha.ts          hash de senha com scrypt
    sessao.ts         sessão opaca, expiração, token CSRF
    banco.ts          esquema, fixtures, leitura e gravação SEM autorização
    modelo.ts         modelo simulado com contadores
    app.ts            cookie, sessão, CSRF, contratos HTTP, rotas, erros
    conversas.ts      decisões de acesso (implementadas por Wagner)
    investigacao.ts   executor da investigação (requisições montadas por Wagner)
    server.ts         servidor local
    test/             unidade, app.inject, HTTP pela rede
  frontend/src/
    api.ts            cliente HTTP (cookie automático + x-csrf-token)
    App.tsx           login, identidade, sair, lista, abrir, criar, responder
```

### Preparado pelo assistente

- A autenticação e a sessão, o CSRF e os contratos HTTP.
- O tratamento de erros, o banco com as fixtures e o modelo simulado.
- Os testes, o frontend completo e as funções de inspeção do executor da
  investigação.

### Implementado por Wagner

- As cinco funções de `conversas.ts`. Os detalhes estão na seção
  [Lógica de autorização](#lógica-de-autorização-implementada-por-wagner).
- As requisições dos três casos da investigação.

## Contas de demonstração

As credenciais abaixo são **públicas e exclusivas da demonstração local**. Não
são contas reais e só existem no banco em memória.

| Login | Senha | ID |
|---|---|---|
| `ana` | `ana-demo-local` | `u-ana` |
| `carlos` | `carlos-demo-local` | `u-carlos` |

As conversas das fixtures são três:

- `conv-ana-1` e `conv-ana-2`, da Ana. A `conv-ana-2` contém uma anotação
  "privada".
- `conv-carlos-1`, do Carlos.

## Autenticação e sessão

- **Sessão opaca:** o cookie `sessao` leva só um token aleatório de 32 bytes.
  A identidade fica na tabela `sessoes` do servidor.
- **O servidor guarda o hash do token:** a tabela tem o SHA-256 do token, não
  o token. Isso impede a reutilização direta do valor armazenado, mas não
  resolve qualquer comprometimento do banco.
- **Expiração e logout:**
  - a sessão tem expiração absoluta de 8 horas; depois disso, é apagada e
    recusada;
  - o logout (`DELETE /sessao`) apaga a sessão e limpa o cookie;
  - cada login abre uma sessão nova e encerra a anterior daquele navegador.
- **Senhas com `scrypt`,** do `node:crypto`:
  - parâmetros N=2¹⁷, r=8, p=1, sal aleatório e comparação em tempo constante;
  - quando o login não existe, a verificação usa um hash falso com os mesmos
    parâmetros e devolve a mesma resposta. Isso reduz a diferença de tempo
    entre "login inexistente" e "senha errada", mas não comprova tempos
    idênticos.
- **Atributos do cookie:**
  - **HTTP local:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`, sem
    `Secure`;
  - **HTTPS:** `Secure` (opção `cookieSeguro: true`) e, de preferência, o
    prefixo `__Host-` no nome.
- **CSRF:**
  - cada sessão tem um token CSRF próprio, exigido no cabeçalho
    `x-csrf-token` em toda escrita autenticada (criar, responder, sair);
  - escritas marcadas pelo navegador como `Sec-Fetch-Site: cross-site` são
    recusadas com 403.

  O `SameSite` sozinho não resolve toda a proteção contra CSRF:
  - "mesmo site" inclui subdomínios;
  - há navegadores que ignoram o atributo;
  - a navegação GET de nível superior envia o cookie.
- **Identidade na requisição:** um hook valida o cookie e preenche
  `request.usuario` (tipo `UsuarioAutenticado`). As rotas protegidas usam
  `exigirUsuario` para leitura e `exigirEscritaAutenticada` para escrita, que
  exige também o CSRF.
- **Logs:** não registram senha, cookie nem token CSRF. Há um teste que
  confere isso.

## Lógica de autorização (implementada por Wagner)

| Função | Comportamento |
|---|---|
| `listarConversasDe` | `WHERE proprietario_id = ?` com `usuario.id`, mais recentes primeiro |
| `buscarConversaAcessivel` | `WHERE id = ? AND proprietario_id = ?`; devolve `null` se não existir ou não for do usuário |
| `criarConversa` | `inserirConversa(banco, { titulo, proprietarioId: usuario.id })` |
| `abrirConversa` | chama `buscarConversaAcessivel`; sem acesso, devolve `null` antes de carregar as mensagens |
| `responder` | autoriza → carrega o histórico → chama o modelo → grava a pergunta e a resposta juntas |

**Criação e acesso funcionam de jeitos diferentes:**

- **Na criação, o proprietário é derivado da sessão.** O corpo não tem por
  onde informar um dono, então não há comparação a fazer.
- **No acesso a um recurso que já existe, há verificação de vínculo:** a
  consulta exige ao mesmo tempo o ID da conversa e o proprietário.

A consulta que inclui o proprietário facilita aplicar a regra: sem acesso, a
linha nem sai do banco. Buscar primeiro e verificar depois também pode ser
correto, desde que nenhum dado seja exposto e nenhum efeito aconteça antes da
autorização.

## Contratos HTTP

| Rota | O que faz |
|---|---|
| `POST /sessao` | login com `{ login, senha }` |
| `GET /sessao` | identidade atual e token CSRF |
| `DELETE /sessao` | logout, exige CSRF |
| `GET /conversas` | lista as conversas do usuário |
| `POST /conversas` | cria uma conversa com `{ titulo }`, exige CSRF |
| `GET /conversas/:id` | abre a conversa com as mensagens |
| `POST /conversas/:id/mensagens` | envia `{ texto }` e recebe a resposta simulada, exige CSRF |

| Status | Quando |
|---|---|
| 401 | sessão ausente, inválida ou expirada |
| 403 | CSRF ausente ou inválido; escrita cross-site |
| 404 | conversa inexistente **ou** inacessível, com status e corpo idênticos (`CONVERSA_NAO_ENCONTRADA`) |
| 400 | entrada inválida, incluindo propriedades extras |

Os erros têm o formato `{ erro: { codigo, mensagem } }`, sem detalhes
internos.

**Campos extras.** O padrão do Fastify é remover campos extras em silêncio
(`removeAdditional: true`). Aqui ele foi configurado com
`removeAdditional: false`, então um `userId` no corpo é **rejeitado** com 400
em vez de ser ignorado. Essa rejeição no contrato **não substitui** atribuir
o proprietário corretamente no backend.

## Construção

**Verificado pelo assistente:**

- **Conferências por TODO**, com app.inject e com a função de acesso testada
  diretamente:
  - a lista de cada usuário traz só as conversas dele;
  - `buscarConversaAcessivel` devolve `null` para as conversas da outra conta;
  - na criação, o proprietário vem da sessão;
  - uma resposta autorizada chama o modelo 1 vez com o histórico e grava 2
    mensagens;
  - uma conversa inexistente dá 404, sem chamar o modelo e sem gravar.
- **Testes da construção,** com app.inject: Ana e Carlos listam e abrem as
  próprias conversas; uma conversa nova pertence ao usuário autenticado; a
  resposta autorizada chama o modelo e grava; uma conversa inexistente dá 404
  sem efeitos.

**Relatado por Wagner, no navegador:**

- Ana e Carlos veem e abrem só as próprias conversas.
- A conversa criada pela Ana pertence a `u-ana`.
- A resposta simulada aparece.
- O "Sair" volta ao login, e recarregar a página não restaura a sessão.
- A conversa criada pela Ana não aparece na lista do Carlos.

**Aprendizado.** O typecheck não detectou nomes de coluna errados dentro das
strings SQL. Para o TypeScript, o SQL é só texto. O problema só apareceu ao
executar: a rota devolveu 500 até a correção.

## Investigação: acesso a recurso alheio

O executor `npm run investigar` (`src/investigacao.ts`) roda a **aplicação
real** por app.inject, dentro do processo e **sem rede nem navegador**:

- o banco é isolado, em memória;
- a Ana entra pelo fluxo existente (`POST /sessao`);
- o cookie e o token CSRF são válidos e ficam só em memória, sem serem
  impressos.

Como a requisição só pode ser recusada pela regra investigada, as escritas
levam sessão e CSRF válidos.

| Caso | Previsão do Wagner | Resultado | Quem barrou |
|---|---|---|---|
| A. Ana abre `conv-carlos-1` | 404, sem dados da conversa | 404, com **status e corpo idênticos** aos de um ID inexistente; sem título, mensagens ou proprietário | `abrirConversa` (`if (!conversa) return null`) |
| B. Ana pede resposta em `conv-carlos-1` | 0 chamadas ao modelo, 0 mensagens gravadas | 404; Δ chamadas ao modelo = 0, Δ mensagens = 0 | `responder`, antes de carregar o histórico |
| C. Ana cria uma conversa com `userId: "u-carlos"` | 400, sem criação | 400 `ENTRADA_INVALIDA`; Δ conversas = 0 | schema (`additionalProperties: false`); o handler nem foi executado |

No caso B, a conclusão não depende só do status. Os contadores mostram que o
modelo não foi chamado e que nada foi gravado. Na construção, os mesmos
contadores mudaram numa resposta autorizada, o que confirma que eles
funcionam.

O caso C demonstra uma **rejeição estrutural**: ele não testa
`criarConversa`. A atribuição correta do proprietário foi verificada na
construção e não foi repetida aqui.

**Lição central.** Antes de concluir que uma proteção funcionou, é preciso
comprovar que a requisição chegou até ela. Durante a montagem, três
requisições foram barradas por outra coisa:

- **Caso A:** o ID do usuário (`u-carlos`) foi usado como ID de conversa. A
  requisição pediu um recurso inexistente, e o 404 não dizia nada sobre a
  regra de acesso.
- **Caso B:** um campo com nome errado no corpo foi barrado pelo schema (400)
  antes da autorização.
- **Caso C:** uma barra no final da URL (`/conversas/`) levou ao 404 do
  roteador do Fastify.

## Execução

### Instalação

Na raiz do repositório:

```powershell
npm install --prefix 18-autorizacao/backend
npm install --prefix 18-autorizacao/frontend
```

### Aplicação

Use dois terminais:

```powershell
# terminal 1: backend na porta 3001
cd 18-autorizacao/backend
npm start
```

```powershell
# terminal 2: frontend em http://localhost:5173
cd 18-autorizacao/frontend
npm run dev
```

O banco fica em memória. Reiniciar o backend apaga sessões e conversas
criadas, e recria as fixtures.

### Validação

```powershell
cd 18-autorizacao/backend
npm run typecheck
npm test
npm run investigar    # executor da investigação, sem rede
```

```powershell
cd 18-autorizacao/frontend
npm run typecheck
npm run lint
npm run build
```

## Verificações

Todas as verificações abaixo são de etapas anteriores.

| Tipo | O que foi verificado | Quando |
|---|---|---|
| Testes de unidade (4) | hash scrypt; criação, expiração e encerramento da sessão; o banco guarda o hash do token; comparação do CSRF | preparação |
| app.inject (15) | atributos do cookie, inclusive `Secure` em HTTPS; login recusado com resposta igual; campos extras dão 400; 401 sem sessão, com cookie inventado e com sessão expirada; logout exige CSRF e invalida a sessão; escrita cross-site e escrita sem CSRF dão 403; `userId` dá 400; logs sem segredos; os 4 testes da construção | preparação e construção |
| HTTP pela rede (1) | `Set-Cookie` real; login → sessão → logout → 401 | preparação |
| Funções testadas diretamente | `buscarConversaAcessivel` e conferências por TODO | construção |
| HTTP pelo proxy do Vite | script temporário com o ciclo de sessão e as rotas ainda pendentes; o log não continha a senha nem cookies | preparação |
| Navegador | os cinco passos da construção, relatados por Wagner | construção |
| Investigação | `npm run investigar`, executado pelo assistente a cada correção; Wagner montou as requisições e interpretou os resultados | investigação |

**Resultado final da suíte:** 20 testes passaram (4 de unidade, 15 com
app.inject e 1 pela rede), e o typecheck do backend não acusou erros. Build e
lint do frontend passaram na preparação.

## Limitações

- **Aplicação de estudo:** é local e não demonstra segurança de produção.
- **Modelo de dados:** duas identidades fictícias e propriedade individual,
  sem organizações, compartilhamento, papéis ou autenticação externa.
- **Banco em memória.**
- **Sem provedor real de IA.**
- **Investigação limitada:** cobre os três casos descritos e roda só por
  app.inject, sem rede nem navegador.
- **Fora do escopo:** auditoria completa, estudo de enumeração, limite de
  tentativas de login e rotação do token CSRF.
- **Dependências:** na preparação, o `npm audit` do frontend apontou alertas
  na cadeia de ferramentas do Vite. É um resultado histórico; o estado atual
  não foi verificado.
