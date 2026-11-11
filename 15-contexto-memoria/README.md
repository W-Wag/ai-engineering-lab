# 15-contexto-memoria

## Objetivo

Montar um contexto reduzido a partir de uma conversa: selecionar as rodadas
recentes e combiná-las com instruções estáveis e com o estado atual fornecido
pela aplicação, sem alterar o histórico original. Em seguida, comparar o que o
contexto carrega quando a informação está **ausente**, **desatualizada** ou
**atual**.

Não há API, banco, frontend nem chamada a modelo: o módulo monta e inspeciona
os blocos do contexto no terminal.

## Conceitos

- O histórico armazenado é diferente do contexto enviado. Uma informação no
  banco não está automaticamente disponível para o modelo.
- Excluir uma rodada do contexto não a apaga do histórico.
- As mensagens recentes não necessariamente contêm as decisões antigas
  importantes.
- Uma correção posterior do usuário deve prevalecer sobre a informação antiga.
- Um resumo pode preservar informação, mas também omitir restrições ou manter
  decisões que já foram corrigidas.
- Um estado estruturado pode representar as decisões atuais, mas a sua
  atualização correta precisa ser garantida pela aplicação.
- Informação disponível no contexto não garante uma resposta correta.
- Resumo ou estado não substituem uma confirmação validada pelo backend, e não
  autorizam operações.

## Estrutura

```text
15-contexto-memoria/
  src/
    tipos.ts          Rodada, EstadoAtual, BlocoDeContexto, ContextoMontado
    dados.ts          instruções, estado (fixture), resumo (fixture), histórico, mensagem atual
    apresentacao.ts   impressão do histórico e do contexto no terminal
    contexto.ts       selecionarRodadas e montarContexto
    exercicio.ts      construção: monta o contexto para um N
    investigacao.ts   investigação: compara as variantes A, B e C
```

### Infraestrutura preparada

- Configuração TypeScript e scripts `start`, `investigar` e `typecheck`.
- Tipos:
  - `Rodada`: uma mensagem do usuário e a resposta do assistente, com número;
  - `EstadoAtual`: marca, público, formato e restrições;
  - `BlocoDeContexto`: blocos separados para `instrucoes`, `estado`, `resumo`
    e `mensagem`. O conteúdo do usuário nunca vira instrução da aplicação;
    estado e resumo entram como dados;
  - `ContextoMontado`: blocos, rodadas incluídas e rodadas fora do contexto.
- Dados fictícios da marca Aurora:
  - histórico de sete rodadas concluídas;
  - mensagem atual separada: "Agora produza a versão final do carrossel.";
  - `ESTADO_ATUAL`: fixture escrita à mão a partir da conversa, sem extração
    automática nem validação por modelo;
  - `RESUMO_DESATUALIZADO`: fixture escrita à mão para a investigação, não
    gerada por modelo.
- Apresentação no terminal, com o tipo de cada bloco, as rodadas incluídas e
  as que ficaram fora.
- Conferência de que o histórico foi preservado: compara o JSON do histórico
  antes e depois da montagem.
- Executor da investigação, com N = 2, que imprime as variantes, conta quantas
  foram montadas e confere o histórico.

### Lógica implementada no exercício

- `selecionarRodadas(historico, n)`: valida `n` e devolve as últimas `n`
  rodadas, em ordem cronológica, sem alterar o histórico.
- `montarContexto(...)`: monta os blocos e identifica as rodadas incluídas e
  as que ficaram fora do contexto.
- Em `investigacao.ts`: a função `montarVariante` e as três variantes.

## Construção

### Histórico

| Rodada | Pedido do usuário |
|---|---|
| 1 | não mencionar preços |
| 2 | público jovem, de 18 a 24 anos |
| 3 | formato: carrossel de 5 telas |
| 4 | pergunta sobre o tom |
| 5 | correção: público adulto, de 30 a 45 anos |
| 6 | troca do título da tela 2 |
| 7 | manter o convite para a loja na tela 5 |

Cada rodada concluída reúne a mensagem do usuário e a resposta do assistente.
Selecionar rodadas inteiras evita cortar uma troca pela metade. A mensagem
atual fica separada, porque ainda não tem resposta.

### Ordem do contexto

```text
instruções → estado atual → últimas N rodadas → mensagem atual
```

Cada rodada vira duas mensagens, do usuário e do assistente. A mensagem atual
entra uma única vez, no final, com papel de usuário.

### Contrato de N

- inteiro não negativo;
- `0` não seleciona nenhuma rodada;
- um valor maior que a quantidade de rodadas seleciona todas;
- valores inválidos (negativo, fracionário, `NaN`, `Infinity`) lançam
  `RangeError`.

A seleção calcula o início como `total - n`, limitado a zero, e usa
`slice`. Isso evita a armadilha de `slice(-0)`, que devolveria o histórico
inteiro com `n = 0`.

### Aprendizados

- **Com N = 2, as rodadas selecionadas são a 6 e a 7.** Elas tratam só dos
  títulos das telas. As decisões completas sobre preços, público e formato
  ficaram nas rodadas 1, 3 e 5, fora do contexto, e chegam ao modelo apenas
  pelo bloco de estado.
- **O typecheck não comprova a correção semântica da conversa.** Durante a
  implementação, a mensagem atual ficou com o papel de assistente. O tipo
  aceitava esse valor, e o erro só apareceu na saída: o pedido do usuário
  seria apresentado ao modelo como algo que o próprio assistente disse.

## Investigação: três variantes

As três variantes usam as mesmas instruções, as mesmas rodadas recentes (6 e
7, com N = 2) e a mesma mensagem atual. Muda só o bloco entre as instruções e
as rodadas:

| Variante | Bloco entre instruções e rodadas |
|---|---|
| A — Mensagens recentes | nenhum (sem estado e sem resumo) |
| B — Resumo desatualizado | resumo manual: "Público jovem; carrossel de 5 telas." |
| C — Estado atual | o estado usado na construção |

As variantes são montadas por `montarVariante`, que reaproveita
`selecionarRodadas`. Nenhuma decisão é copiada para as instruções.

### Classificação

| Variante | Preços | Público | Formato |
|---|---|---|---|
| A | Restrição ausente | Ausente | Parcial: carrossel, sem a definição de cinco telas |
| B | Restrição ausente | Desatualizado: jovem | Atual: carrossel de cinco telas |
| C | Restrição atual disponível | Atual: adultos de 30 a 45 anos | Atual |

Em A, o formato não está completamente ausente: o pedido atual menciona
"carrossel", e as rodadas citam as telas 2 e 5. Falta a definição completa,
que estava na rodada 3.

A variante B mostra que um resumo desatualizado é pior que a ausência: além de
omitir a restrição sobre preços, ele traz uma orientação errada sobre o
público. A variante C torna as decisões atuais disponíveis, mas isso não
garante que um modelo vai segui-las.

### Previsões e resultados

- **Construção:** antes da execução com N = 2, o aluno previu corretamente as
  rodadas 6 e 7. A previsão de que o público adulto e o carrossel estariam
  nessas rodadas foi corrigida depois de inspecionar a saída: nenhuma das
  decisões estava nelas.
- **Investigação:** as previsões, registradas antes da execução, coincidiram
  com as observações:
  - em A, a restrição sobre preços não está no contexto, embora continue no
    histórico;
  - em B, o resumo preserva o formato, mantém o público jovem desatualizado e
    omite a restrição sobre preços;
  - em C, as decisões atuais estão disponíveis, o que não garante que o modelo
    vai segui-las.
- A classificação do aluno não cobriu o público e o formato da variante A. O
  complemento (público ausente, formato parcial) foi feito pelo assistente.
- Não houve geração de resposta por modelo.

### Ajuste final nas instruções

As instruções diziam "Use o estado atual como as decisões em vigor", o que
pressupunha um bloco de estado inexistente nas variantes A e B. Elas passaram
a ser condicionais:

> Quando houver um bloco de estado atual, use-o como referência das decisões
> em vigor; não presuma informações ausentes.

As instruções continuam idênticas nas três variantes e continuam dizendo que
estado e demais dados de contexto não autorizam nenhuma operação.

## Execução

O módulo roda com Node 24. Na raiz do repositório:

```powershell
npm install --prefix 15-contexto-memoria
```

Na pasta `15-contexto-memoria`:

```powershell
npm run typecheck        # tsc --noEmit
npm start -- 2           # construção com N = 2 (sem argumento, usa N = 2)
npm start -- 0           # nenhuma rodada anterior
npm run investigar       # variantes A, B e C, com N = 2
```

Nenhum comando chama a Groq ou outro modelo.

## Verificações

**Anteriores, pelo assistente:**

- typecheck sem erros;
- um roteiro temporário, fora do módulo, chamando `selecionarRodadas`:
  N = 2 → [6, 7]; 0 → []; 7 e 10 → todas; -1, 1.5, `NaN` e `Infinity` →
  `RangeError`; histórico inalterado;
- `npm start` com N = 2, 0 e 10: rodadas esperadas, mensagem atual uma única
  vez, histórico preservado; N = -1 → `RangeError`;
- `npm run investigar`: três variantes, mesmas rodadas e mensagem atual,
  ausência de estado em A e B, resumo só em B, estado só em C, histórico
  preservado.

O roteiro temporário não faz parte do módulo, que não tem suíte de testes
automatizados.

**Relatada pelo aluno:** a execução de `npm run investigar`, com a saída das
três variantes usada na classificação.

**Nesta etapa, após o ajuste das instruções:**

- typecheck sem erros;
- `npm run investigar`: três variantes, rodadas 6 e 7 em todas, instruções
  novas idênticas nas três, histórico preservado;
- `npm start -- 2`: rodadas 6 e 7, histórico preservado.

## Limitações

- Selecionar N rodadas não equivale a um orçamento de tokens. Nenhum
  tokenizer ou limite real de modelo foi exercitado.
- O estado e o resumo são fixtures, sem extração nem geração automática.
- Inspecionar o contexto não avalia o comportamento de um modelo.
- `slice` copia o array, mas mantém as referências aos mesmos objetos de
  rodada. O histórico não foi modificado no exercício, mas não há garantia de
  imutabilidade profunda.
- O exemplo não tem tool calls. Em conversas com ferramentas, a resposta com
  `tool_calls` e os resultados correspondentes precisam ser mantidos juntos.
- Sem API, banco ou frontend.
