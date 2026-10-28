# 10-idempotencia

## Objetivo

Evitar novas gravações quando a mesma operação é repetida, usando uma chave de
idempotência e um registro de operações em memória.

- Mesma operação, mesmos dados, nova tentativa: usa a mesma chave. A
  repetição devolve o resultado já produzido, sem gravar de novo.
- Operação diferente: usa uma nova chave. Isso não dispensa autorização,
  confirmação nem as regras do negócio, que continuam valendo para ela.
- A chave identifica a operação; o agendamento tem o seu próprio `id`,
  atribuído pela gravação. São coisas diferentes.

O exercício não usa API, modelo de IA, banco nem agendamento real.

## Estrutura e responsabilidades

- `src/tipos.ts`: tipos do exercício.
- `src/armazenamento.ts`: registro de operações em memória.
- `src/dados.ts`: chave fixa, solicitações e a confirmação usada na
  investigação.
- `src/exercicio.ts`: `executarIdempotente` e o cenário de execução.

Do módulo 09 vêm a sessão, a confirmação original, os tipos de proposta e
agendamento, a gravação simulada (`gravarAgendamento`, `contarGravacoes`) e as
verificações (`verificarSolicitacao`).

### Tipos

```ts
type SolicitacaoIdempotente = SolicitacaoExecucao & { chaveIdempotencia: string };

type ChaveOperacao = {
  usuario: string;
  tipoOperacao: "criar-agendamento";
  valor: string;
};

type RegistroOperacao = {
  chave: ChaveOperacao;
  dados: DadosProposta;
  resultado: AgendamentoGravado;
};

type ResultadoIdempotente =
  | { tipo: "criado"; agendamento: AgendamentoGravado }
  | { tipo: "reutilizado"; agendamento: AgendamentoGravado }
  | { tipo: "conflito"; motivo: string }
  | { tipo: "bloqueado"; motivo: string };
```

- `chaveIdempotencia` é o valor informado por quem chama.
- `ChaveOperacao` delimita esse valor pelo usuário autenticado e pelo tipo
  de operação. O mesmo valor usado por outro usuário é outra operação.
- `RegistroOperacao` guarda uma cópia dos dados aprovados e o agendamento
  devolvido na primeira execução.
- `ResultadoIdempotente` distingue criação, reutilização, conflito e
  bloqueio pelas verificações.

### Armazenamento

```ts
montarChaveOperacao(sessao: SessaoAutenticada, valor: string): ChaveOperacao
consultarOperacao(chave: ChaveOperacao): RegistroOperacao | undefined
registrarOperacao(chave: ChaveOperacao, dados: DadosProposta, resultado: AgendamentoGravado): RegistroOperacao
contarOperacoes(): number
```

- `montarChaveOperacao` usa o usuário da sessão, não o da solicitação.
- Os registros ficam num `Map` em memória, indexado por um texto montado a
  partir das três partes da chave. Não há hash nem persistência.
- `registrarOperacao` guarda cópias congeladas da chave, dos dados e do
  resultado. Alterar depois os objetos recebidos não altera o registro, e o
  registro devolvido por `consultarOperacao` não pode ser modificado.
- `registrarOperacao` não substitui registros: lança erro se a chave já
  existir.

## Fluxo implementado

`executarIdempotente(sessao, solicitacao, confirmacao)`:

1. Executa `verificarSolicitacao`, reaproveitada do módulo 09: formato,
   cliente igual ao usuário da sessão, confirmação do usuário da sessão e
   correspondência com os dados confirmados. Se alguma falhar, devolve
   `bloqueado` com o motivo. Bloqueios não são registrados como operações.
2. Monta a chave da operação com o usuário da sessão, o tipo de operação e
   o valor informado.
3. Consulta a operação registrada para essa chave.
4. Se existir registro, compara explicitamente cliente, profissional, data e
   horário da solicitação com os dados registrados:
   - mesmos dados: devolve `reutilizado` com o agendamento registrado, sem
     gravar;
   - dados diferentes: devolve `conflito`, citando os campos divergentes,
     sem gravar e sem substituir o registro.
5. Se não existir registro, grava com os dados confirmados
   (`confirmacao.dados`), registra a operação e devolve `criado`.

As verificações vêm antes da consulta: conhecer a chave não dá acesso ao
resultado guardado. Dentro do bloco de registro existente, todo caminho
termina num `return`, então reutilização e conflito nunca chegam à gravação.

## Construção e investigação

O cenário final em `src/exercicio.ts` faz três chamadas sequenciais com a
mesma chave (`agendamento-joao-001`) e o mesmo armazenamento, sem
reinicialização.

| Chamada | Solicitação e confirmação                  | Resultado                     |
| ------- | ------------------------------------------ | ----------------------------- |
| 1       | 09:00                                      | `criado`, agendamento ID 1    |
| 2       | 14:00, com confirmação própria das 14:00   | `conflito` no campo `horario` |
| 3       | 09:00 novamente                            | `reutilizado`, agendamento ID 1 |

Total observado: uma gravação. Motivo do conflito:

```text
Os dados da operação divergem do que está registrado nessa chave nos seguintes campos: horario
```

- A primeira e a terceira chamadas atendem ao objetivo: a mesma chave com
  os mesmos dados devolve o mesmo agendamento, sem nova gravação.
- A terceira chamada também mostra que o conflito da segunda não substituiu
  o registro original: a chave continua associada ao agendamento das 09:00.

A confirmação das 14:00 (`confirmacaoConflito`) e a solicitação
correspondente existem em `src/dados.ts` apenas para a investigação.

## Bloqueio e conflito

São resultados diferentes, produzidos em pontos diferentes do fluxo:

- **Bloqueio:** a solicitação não corresponde à proposta confirmada. Os
  controles do módulo 09 barram antes de qualquer consulta ao registro.
- **Conflito:** a solicitação corresponde à sua confirmação e passa pelos
  controles, mas seus dados divergem dos registrados para a chave.

Na primeira tentativa de investigação, relatada, o horário foi alterado
apenas na confirmação, mantendo a solicitação das 09:00. Solicitação e
confirmação divergiam entre si, e o resultado foi `bloqueado` pela verificação
de correspondência, antes da consulta ao registro. Para produzir o conflito, o
cenário final usa solicitação e confirmação próprias, ambas às 14:00.

## Aprendizados

- Testar somente dados iguais pode esconder erros na comparação. Uma
  primeira versão usava o mesmo teste para os campos iguais e os diferentes;
  o cenário de dados iguais funcionava e escondia o erro.
- Os caminhos de reutilização e conflito precisam encerrar antes da gravação.
- Rejeitar um registro duplicado depois de gravar não desfaz o efeito já
  produzido: o erro de `registrarOperacao` chegaria depois de uma gravação a
  mais.
- Conhecer uma chave não concede acesso ao resultado.
- Uma nova requisição pode ser uma repetição da mesma operação.
- Uma nova intenção não deve reutilizar a chave de uma operação anterior.

## Integração com o módulo 09

No módulo 09, as verificações estavam dentro do script do exercício, que
executa ao ser importado. Elas foram extraídas, sem alterar a lógica nem as
mensagens, para `verificarSolicitacao` em `09-acoes-seguras/src/verificacoes.ts`,
que devolve o motivo do primeiro bloqueio ou `undefined`. O exercício do
módulo 09 passou a chamar essa função.

Os controles não foram reimplementados no módulo 10: ele importa e executa a
mesma função. A saída do exercício do módulo 09 foi conferida como idêntica
antes e depois da extração.

## Limitações

- Execução sequencial e armazenamento em memória.
- Os registros são perdidos ao encerrar o processo.
- Sem recuperação de falha entre a gravação e o registro da operação.
- Sem coordenação entre processos, expiração ou retries automáticos.
- Sem controle de dupla reserva entre chaves diferentes.
- Não é uma garantia de produção.

O exercício executa as chamadas uma de cada vez. Ele não fornece nem valida
uma estratégia geral de coordenação concorrente ou distribuída.

## Pendências menores

- No módulo 09, o motivo do bloqueio pelo dono da confirmação diz “A
  confirmação que o cliente enviou não corresponde ao usuário logado”. A
  confirmação é um registro da aplicação. Outros motivos do módulo 09 têm
  “esta” e “e” sem acento onde seriam “está” e “é”.
- O comentário de topo de `src/exercicio.ts` descreve apenas duas chamadas
  com os mesmos dados; o cenário final tem três.
- Os comentários `TODO` continuam no arquivo, embora implementados.

## Como executar

O módulo roda com Node 24 em Linux, macOS ou Windows, e usa apenas `tsx` e
`typescript` como dependências de desenvolvimento. Não chama APIs externas
nem precisa de credencial. Instale as dependências no mesmo sistema em que for
executar; os comandos `npm` abaixo são os mesmos em qualquer terminal.

Na pasta `10-idempotencia`:

```bash
npm install
npm run typecheck
npm start
```

`npm start` executa as três chamadas do cenário final e exibe os resultados,
os IDs dos agendamentos e a quantidade de gravações.

## Validação

Nenhuma verificação foi executada durante a escrita desta documentação. As
evidências abaixo têm origens diferentes.

Conferido em execuções anteriores, na preparação e na conferência do
exercício:

- `npm run typecheck` sem erros nos módulos 09 e 10;
- cenário final com três chamadas e uma gravação;
- saída do exercício do módulo 09 preservada após a extração de
  `verificarSolicitacao`;
- auxiliares, na preparação: mensagens de `verificarSolicitacao` iguais às
  originais; registro inalterado quando a entrada é alterada depois; a mesma
  chave com outro usuário ou outro valor não encontra o registro; registrar
  de novo a mesma chave lança erro; registrar não grava agendamento.

Relatado, sem reexecução:

- a primeira tentativa de investigação, com resultado `bloqueado`.

Não exercitado no cenário final:

- o caminho `bloqueado` dentro do fluxo idempotente.
