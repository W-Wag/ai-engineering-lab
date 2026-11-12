# 16-revisoes-controladas

## Objetivo

Receber uma proposta de revisão como `unknown`, validar sua estrutura e os
campos permitidos e aplicar a revisão sem modificar o briefing original.

O módulo trata de quatro coisas diferentes:

- **Sintaxe JSON:** se o texto pode ser lido como JSON. Este exercício não faz
  essa leitura.
- **Estrutura dos dados:** se o objeto tem as propriedades e os tipos
  esperados.
- **Escopo dos campos:** se a proposta altera somente os campos que a
  aplicação permitiu.
- **Fidelidade do conteúdo:** se o que o texto afirma é sustentado pelos fatos
  e respeita o pedido.

O código só valida a estrutura e o escopo. A fidelidade do conteúdo é
analisada à mão, na investigação.

O exercício trabalha com objetos simulados. Ele não faz parsing de JSON e não
usa Structured Outputs de nenhum provedor. Também não usa API, banco,
frontend ou modelo.

## Estrutura

```text
16-revisoes-controladas/
  src/
    tipos.ts                Briefing, CAMPOS_REVISAVEIS, Alteracoes, resultados
    dados.ts                briefing original, campos permitidos, propostas A, B e C
    dados-investigacao.ts   fatos disponíveis, pedido e proposta da investigação
    apresentacao.ts         impressão no terminal
    revisao.ts              validarEstrutura, camposForaDoEscopo, aplicarAlteracoes, revisar
    exercicio.ts            construção: roda as propostas A, B e C
    investigacao.ts         investigação: proposta com afirmação sem fundamento
```

### Preparado pelo assistente

- A configuração TypeScript e os scripts `start`, `investigar` e `typecheck`.
- Os tipos e os resultados possíveis de uma revisão:
  - `estrutura_invalida`;
  - `fora_do_escopo`;
  - `revisao_aplicada`.
- As fixtures fictícias da marca Aurora:
  - o briefing original;
  - a lista `CAMPOS_PERMITIDOS`;
  - as propostas simuladas A, B e C;
  - os fatos, o pedido e a proposta da investigação.
- A apresentação no terminal.
- Em `exercicio.ts`, a conferência de que o original foi preservado.
- Em `investigacao.ts`, a apresentação do cenário.

### Implementado por Wagner

- Em `revisao.ts`, as funções `validarEstrutura`, `camposForaDoEscopo`,
  `aplicarAlteracoes` e `revisar`.
- Em `investigacao.ts`:
  - a chamada a `revisar`;
  - a exibição do resultado;
  - a conferência de que o original foi preservado;
  - a análise manual da proposta, registrada em comentário no arquivo.

## Contrato e construção

### Contrato

- O `Briefing` tem quatro campos: `versao`, `mensagemPrincipal`, `publico` e
  `chamadaParaAcao`.
- A proposta chega como `unknown`, como chegaria um dado vindo de fora.
- A lista de campos permitidos é um argumento separado, fornecido pela
  aplicação.
- A proposta não pode conceder permissões a si mesma. Uma propriedade
  `camposPermitidos` dentro dela é só uma propriedade desconhecida.
- A versão é controlada pela aplicação. `versao` não está entre os campos
  revisáveis, e a proposta não pode alterá-la.

A validação estrutural recusa a proposta nestes casos:

- quando não é um objeto: `null`, arrays e outros tipos são rejeitados com
  "precisa ser um objeto";
- quando é um objeto vazio: "nenhum campo enviado";
- quando tem uma propriedade fora de `CAMPOS_REVISAVEIS`: "propriedade
  desconhecida: …";
- quando um valor não é texto ou fica vazio depois de `trim()`: "valor
  inválido em …: precisa ser texto não vazio".

Mais três regras completam a validação:

- Um campo omitido mantém o valor atual. `null` não significa apagar.
- Números não são convertidos em texto.
- Um campo indevido é rejeitado, nunca descartado em silêncio. Quando a
  proposta é inválida, todos os motivos são devolvidos juntos.

### Fluxo

```text
revisar(original, proposta, permitidos)
  validarEstrutura(proposta)        → inválida: estrutura_invalida
  camposForaDoEscopo(alteracoes)    → algum campo: fora_do_escopo
  aplicarAlteracoes(original, ...)  → revisao_aplicada, com a nova versão
```

- A proposta inteira é validada antes de qualquer aplicação.
- Uma falha rejeita a proposta inteira. Não existe revisão parcial.
- O sucesso produz um novo objeto, com a versão incrementada pela aplicação.
  O original não é modificado.

**O que `revisao_aplicada` significa.** Estrutura e escopo foram aceitos.
Isso não quer dizer que o conteúdo foi aprovado ou que está correto.

## Cenários da construção

O único campo permitido é `mensagemPrincipal`.

| Proposta | Conteúdo | Resultado |
|---|---|---|
| A | altera só `mensagemPrincipal` | `revisao_aplicada`, versão 2; os demais campos são preservados |
| B | altera também `chamadaParaAcao` | `fora_do_escopo` (`chamadaParaAcao`); a proposta é rejeitada inteira, inclusive a mensagem principal |
| C | `mensagemPrincipal: 42` | `estrutura_invalida`; o número não é convertido |

Nos três casos, o briefing original continua na versão 1, sem alterações.

Wagner optou por não registrar previsões antes de executar a construção.

### Aprendizados

- **Um `return` dentro do laço que percorre as chaves encerrava a validação
  na primeira chave aceita.** As chaves seguintes não eram examinadas. Foi
  assim que a proposta B chegou a perder `chamadaParaAcao` sem aviso, e uma
  proposta com `versao` passava como válida. A decisão só pode ser tomada
  depois de percorrer todas as chaves.
- **`original.versao += 1` alterava o documento original.** A nova versão
  precisa ser calculada (`original.versao + 1`) num objeto novo.
- **O TypeScript não detectou esses erros de comportamento.** O typecheck
  passava nos dois casos. O `Briefing` não marca os campos como somente
  leitura, então nada no tipo impede alterar o original.

## Investigação: conteúdo sem fundamento

### Cenário

- **Pedido do usuário:** "Encurte a mensagem principal, mantendo os fatos."
- **Proposta:** escrita à mão, não gerada por modelo:

  ```ts
  { mensagemPrincipal: "Conheça os cafés Aurora com 20% de desconto." }
  ```

- **Fatos disponíveis:** uma lista fixa em `dados-investigacao.ts`:
  - a linha tem sabor de chocolate;
  - o público é de adultos de 30 a 45 anos;
  - a chamada convida a conhecer a linha na loja;
  - a linha é de cafés. Este fato não vem do briefing original: é um dado
    fictício acrescentado para a investigação.
- **Desconto:** nenhuma informação sobre desconto foi fornecida.

### Resultado

- A estrutura foi aceita.
- A alteração ficou dentro do campo permitido.
- O código retornou `revisao_aplicada`, versão 2.
- O público e a chamada para ação foram preservados.

A análise manual dos fatos mostrou dois problemas:

- **O desconto de 20% não tem fundamento nos dados disponíveis.** Isso não
  prova que seja falso: a ausência de informação só impede fundamentar a
  afirmação neste exercício. Wagner identificou esse ponto.
- **A mensagem omite o sabor chocolate**, embora o pedido fosse manter os
  fatos. Essa observação foi feita pelo assistente como complemento. Wagner
  não a registrou como conclusão.

## Interpretação e limites das validações

- Ter permissão para alterar um campo não autoriza qualquer afirmação dentro
  dele.
- O validador atual controla estrutura e campos, não significado. Por isso,
  pode deixar passar acréscimos sem fundamento e também a perda de fatos.
- O inverso também vale: uma alteração de boa qualidade, mas num campo não
  autorizado, continua fora do escopo e é rejeitada (proposta B).
- O módulo não tem bloqueio da palavra "desconto", expressão regular de
  veracidade nem modelo avaliador.

## Preservação do original e evidências

Para conferir se o original foi preservado, o estado dele é registrado antes
da operação e comparado depois dela:

```text
antes = JSON do original
revisar(...)
preservado = JSON atual do original === antes
```

Se as duas leituras forem feitas em sequência, sem a operação entre elas, a
comparação sempre dá "sim" e não prova nada.

- **Saída colada por Wagner antes da correção:** mostrava a revisão aplicada,
  mas o "preservado: SIM" ainda não era uma evidência válida, porque as duas
  leituras eram feitas em sequência.
- **Execução final do assistente, depois da correção:** confirmou a ordem
  certa das leituras e que o original foi preservado.

Não houve teste com uma alteração proposital do original para demonstrar que
a comparação detectaria a mudança.

## Execução

Na raiz do repositório:

```powershell
npm install --prefix 16-revisoes-controladas
```

Na pasta do módulo:

```powershell
npm run typecheck     # tsc --noEmit
npm start             # construção: propostas A, B e C
npm run investigar    # investigação: proposta com desconto sem fundamento
```

## Verificações

Estas verificações foram feitas durante a construção e a investigação.

**Feitas pelo assistente:**

- **`npm run typecheck`:** sem erros, nas versões finais.
- **`npm start`:** A aplicada na versão 2, B fora do escopo, C com estrutura
  inválida, e o original preservado nos três casos.
- **`npm run investigar`:** `revisao_aplicada`, versão 2, e "briefing original
  preservado: SIM", depois da correção da ordem das leituras.
- **Roteiro temporário, fora do módulo:** testou as quatro funções com
  entradas como propriedade desconhecida, objeto vazio, `camposPermitidos`,
  `versao`, `null`, texto só com espaços, array e texto solto. Também
  confirmou que o original continuava na versão 1. O roteiro não faz parte do
  módulo e não é uma suíte de testes.

**Relatadas por Wagner:**

- **`npm start`:** saída idêntica à do assistente.
- **`npm run investigar`:** saída colada antes da correção da ordem das
  leituras. Veja a seção anterior.

## Limitações

- Não há modelo, API nem Structured Outputs real.
- Não há parsing de JSON: as propostas já chegam como objetos.
- A lista de campos permitidos é uma fixture. Ela não é extraída de linguagem
  natural.
- A análise factual é manual e feita sobre dados fictícios.
- Não há validação semântica.
- Não há persistência, publicação nem efeitos externos.
- Não há tratamento de concorrência nem de revisões sobre uma versão antiga.
- A preservação do original foi observada nas execuções, mas o tipo não
  garante imutabilidade.
