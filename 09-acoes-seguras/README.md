# 09-acoes-seguras

## Objetivo

Controlar uma criação simulada de agendamento: antes de gravar, verificar se
quem pede tem autorização e se a solicitação corresponde a uma proposta
concreta que foi confirmada.

```text
solicitação → formato → identidade e permissão → confirmação do usuário
→ correspondência com a proposta confirmada → gravação
```

O exercício não usa API, modelo de IA nem agendamento real. Não é uma
implementação de autenticação nem uma solução de segurança para produção.

## Dados e responsabilidades

Regra didática deste exercício: clientes só podem agendar para si mesmos.

- `src/tipos.ts`: tipos do exercício.
- `src/dados.ts`: sessão, confirmação e solicitação inicial, todas fictícias.
- `src/gravacao.ts`: gravação simulada em memória.
- `src/formato.ts`: validação básica de formato.
- `src/exercicio.ts`: `executarAgendamento`, com as verificações, e a
  exibição do resultado.

### Dados confiáveis e entrada a verificar

| Dado          | Tipo                  | Papel                                                        |
| ------------- | --------------------- | ------------------------------------------------------------ |
| `sessao`      | `SessaoAutenticada`   | quem está autenticado: usuário `joao`                        |
| `confirmacao` | `Confirmacao`         | quem confirmou (`joao`) e os dados exatos aprovados          |
| solicitação   | `SolicitacaoExecucao` | o que se pede para gravar; é a entrada a verificar           |

- A sessão e a confirmação são simuladas como dados confiáveis da aplicação.
  O exercício não implementa autenticação nem a captura real de uma
  confirmação.
- A confirmação é um registro da aplicação. Ela identifica quem confirmou e
  os dados aprovados: cliente `joao`, profissional `ana`, data `2026-10-20`,
  horário `09:00`. Ela não é enviada pelo cliente na solicitação.
- A solicitação não é prova de confirmação. Ela não tem um campo
  `confirmado`; seus campos dizem o que se quer gravar, não o que foi
  autorizado.
- Confirmação e solicitação não compartilham referências mutáveis. A
  confirmação é congelada com `Object.freeze`, e `criarSolicitacaoInicial()`
  devolve um objeto novo a cada chamada. Alterar a solicitação não altera o
  registro confirmado.

### Gravação e formato

```ts
gravarAgendamento(dados: DadosProposta): AgendamentoGravado
contarGravacoes(): number
listarGravacoes(): AgendamentoGravado[]

verificarFormato(solicitacao: SolicitacaoExecucao): string | undefined
```

- `gravarAgendamento` registra o agendamento em memória e não verifica nada:
  grava o que receber. Decidir se a gravação pode acontecer é de quem chama.
- `contarGravacoes` permite observar quantas gravações ocorreram.
- `verificarFormato` devolve a descrição do primeiro problema ou `undefined`.
  Verifica apenas a forma dos campos: textos não vazios, data `AAAA-MM-DD` e
  horário `HH:MM`.

## Verificações implementadas

`executarAgendamento(sessao, solicitacao, confirmacao)` devolve um
`ResultadoExecucao`:

```ts
type ResultadoExecucao =
  | { executado: true; agendamento: AgendamentoGravado }
  | { executado: false; motivo: string };
```

As verificações acontecem nesta ordem:

1. Formato: a solicitação passa por `verificarFormato`.
2. Identidade e permissão: o cliente da solicitação corresponde ao usuário
   da sessão.
3. Dono da confirmação: a confirmação pertence ao usuário da sessão.
4. Correspondência: cliente, profissional, data e horário da solicitação são
   comparados, campo a campo, com os dados confirmados.

Quando uma verificação falha, a função devolve `executado: false` com o
motivo e não grava. Na verificação de correspondência, o motivo lista os
campos divergentes.

A gravação ocorre somente depois de todas as verificações e usa os dados
confirmados (`confirmacao.dados`), não os da solicitação.

## Resultados observados

### Caso válido

Solicitação igual à proposta confirmada: João, Ana, `2026-10-20`, `09:00`.

Conferido em execução anterior, na conferência do exercício:

- `executado: true`;
- agendamento gravado com `id` 1;
- quantidade de gravações: 1.

### Casos de bloqueio

Relatados, sem reexecução:

| Alteração                                   | Verificação que bloqueou | Motivo                                         |
| ------------------------------------------- | ------------------------ | ---------------------------------------------- |
| profissional diferente na solicitação       | correspondência          | cita o campo `profissional`                    |
| data divergente entre confirmação e pedido  | correspondência          | cita o campo `data`                            |
| confirmação de outro usuário                | dono da confirmação      | confirmação não corresponde ao usuário logado  |
| cliente diferente do usuário autenticado    | identidade e permissão   | cliente diferente do usuário logado            |

Nesses quatro casos, o bloqueio foi relatado, mas a quantidade de gravações
não foi apresentada. Não há contagem observada para eles.

### Investigação final

Relatada, sem reexecução:

- confirmação com horário `09:00`;
- solicitação com horário `14:00`;
- demais dados iguais aos do caso válido.

Resultado:

- `executado: false`;
- o motivo identifica a divergência no campo `horario`;
- quantidade de gravações: 0.

A confirmação aprovada valia para as 09:00. O pedido para as 14:00 é outra
proposta, que não foi confirmada.

## Aprendizados

- Autenticação e autorização são diferentes: saber quem é o usuário não
  responde se ele pode fazer o que está pedindo.
- A identidade confiável vem da sessão validada, não do argumento escolhido
  pelo modelo ou informado na solicitação.
- A confirmação vale para uma proposta concreta, não para qualquer pedido do
  mesmo usuário.
- Alterar o horário exige a aprovação da nova proposta.
- Testar bloqueios significa alterar as entradas, mantendo a regra de
  validação como está.
- Comparar os campos explicitamente evita depender da serialização integral
  do objeto, que varia com a ordem das chaves e com campos extras.
- Uma mensagem de bloqueio deve ser acompanhada da ausência de efeito no
  armazenamento: o motivo sozinho não prova que nada foi gravado.

Neste exercício, o bloqueio é devolvido como resultado estruturado, o que
permite a quem chama exibir o motivo e a contagem de gravações. É uma escolha
deste exercício; usar exceções para sinalizar um bloqueio não é sempre
incorreto.

## Limitações e próximo bloco

- Sem API, modelo de IA ou agendamento real.
- Sem idempotência, expiração da confirmação, concorrência ou validação de
  disponibilidade.
- Sem múltiplos papéis: só existe a regra de que o cliente agenda para si.
- Não é uma solução completa para produção.
- Repetir a mesma solicitação válida ainda pode criar duas gravações.

Pendência de redação no código, não alterada nesta documentação: o motivo do
bloqueio pelo dono da confirmação diz “A confirmação que o cliente enviou
não corresponde ao usuário logado”. A confirmação é um registro da
aplicação, não algo enviado pelo cliente.

Próximo estudo: idempotência, ainda não implementada.

## Como executar

O módulo é executado com Node pelo WSL e usa apenas `tsx` e `typescript`
como dependências de desenvolvimento. Não precisa de API nem de credencial.

Na pasta `09-acoes-seguras`:

```bash
npm install
npm run typecheck
npm start
```

`npm start` executa `src/exercicio.ts` com a solicitação inicial válida e
exibe a sessão, a confirmação, a solicitação, o resultado e a quantidade de
gravações.

## Validação

Nenhuma verificação foi executada durante a escrita desta documentação. As
evidências abaixo têm origens diferentes.

Conferido em execuções anteriores, na preparação e na conferência do
exercício:

- `npm run typecheck` sem erros;
- caso válido, com `executado: true` e uma gravação;
- auxiliares: solicitação inicial igual aos dados confirmados e independente
  deles, confirmação congelada, contador de gravações e validação de
  formato.

Relatado, sem reexecução:

- os quatro casos de bloqueio, sem contagem de gravações apresentada;
- a investigação final com horário divergente, com quantidade de gravações
  igual a 0.

Analisado pela leitura do código:

- nenhum caminho de bloqueio chega à chamada de `gravarAgendamento`.
