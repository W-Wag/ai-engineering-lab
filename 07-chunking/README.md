# 07-chunking

## Objetivo

Dividir um documento Markdown simples em trechos, um por seção `## `,
preservando o conteúdo e a origem de cada trecho, sem separar a regra de
cancelamento de sua exceção.

```text
documento → linhas → seções "## " → trechos com id, fonte, seção e conteúdo
```

O exercício não usa API, embeddings nem banco de dados.

## Estrutura e responsabilidades

- `documentos/manual-atendimento.md`: documento fictício do exercício.
- `src/documento.ts`: `lerDocumento(nome)`, que devolve `{ fonte, conteudo }`,
  e os tipos `Documento` e `Trecho`.
- `src/exercicio.ts`: divisão do documento em trechos e exibição do resultado.

```ts
type Trecho = {
  id: string;
  fonte: string;
  secao: string;
  conteudo: string;
};
```

O formato aceito é delimitado: um título `# ` que identifica o documento,
seguido de seções `## ` curtas. Não é um parser Markdown completo.

## Funcionamento implementado

Toda a divisão está em `src/exercicio.ts`:

1. `lerDocumento("manual-atendimento.md")` lê o arquivo.
2. O conteúdo é dividido em linhas com `split("\n")`.
3. Um loop percorre as linhas mantendo duas variáveis: `sessaoAtual`, com o
   nome da seção em andamento, e `linhasAcumuladas`, com o conteúdo dela.
4. Uma linha iniciada por `## ` é um título de seção. Ela fecha a seção
   anterior, que é salva como trecho, e abre a nova: `sessaoAtual` recebe o
   título sem o prefixo e `linhasAcumuladas` recomeça vazia.
5. As demais linhas são acumuladas na seção atual.
6. Depois do loop, a última seção é salva, porque não há um próximo título
   para fechá-la.

Antes do primeiro `## ` ainda não existe seção atual, então as linhas são
ignoradas. É por isso que o título principal `# Manual de atendimento` não
vira um trecho isolado.

Cada trecho salvo recebe:

- `secao`: o nome da seção, sem o `## `;
- `conteudo`: as linhas acumuladas unidas por espaço, com `trim()`;
- `fonte`: o nome do arquivo;
- `id`: a fonte e o nome da seção unidos por hífen, como
  `manual-atendimento.md-Cancelamento`.

Um trecho só é salvo quando existe seção atual e o conteúdo não é vazio.
Uma seção com título e sem texto é descartada.

## Resultado da construção

Foram produzidos três trechos. Todas as regras abaixo são fictícias e servem
apenas ao exercício.

| id                                    | secao         | conteudo                                                                                                                                          |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual-atendimento.md-Cancelamento`  | Cancelamento  | Cancelamentos com menos de 24 horas de antecedência têm taxa de R$ 30. Essa taxa não se aplica quando o cancelamento é solicitado pela clínica.   |
| `manual-atendimento.md-Duração`       | Duração       | A consulta inicial dura 60 minutos.                                                                                                               |
| `manual-atendimento.md-Funcionamento` | Funcionamento | O atendimento ocorre de segunda a sexta, das 09:00 às 18:00.                                                                                      |

A regra da taxa e sua exceção ficaram no mesmo trecho, porque pertencem à
mesma seção do documento.

## Investigação conceitual

Foi discutida, sem alterar o documento nem executar o código, esta variação:

```markdown
## Cancelamento
Cancelamentos com menos de 24 horas de antecedência têm taxa de R$ 30.

## Exceções
Essa taxa não se aplica quando o cancelamento é solicitado pela clínica.
```

Conclusões da discussão:

- considerando apenas essas duas seções, a divisão produziria dois trechos;
- mantendo Duração e Funcionamento, como no documento original, seriam
  quatro;
- o trecho “Exceções”, isolado, perde a referência completa de “essa taxa”:
  o texto não diz qual taxa nem em que situação ela se aplica;
- recuperar somente o trecho da regra também pode ocultar a exceção;
- respeitar os títulos não garante preservar todas as relações de
  significado;
- para este documento, manter regra e exceção na mesma seção é a organização
  mais simples.

O exercício não implementa detecção automática de dependências semânticas
entre seções. Essa discussão não estabelece uma regra genérica, como unir
automaticamente qualquer seção chamada “Exceções”.

## Aprendizados

- Uma divisão estruturalmente correta pode produzir conteúdo semanticamente
  incompleto.
- Fonte, seção e identificador permitem rastrear a origem de cada trecho.
- IDs reproduzíveis não devem depender de valores aleatórios. Uma versão
  intermediária usava `randomUUID()`, que gera ids distintos, mas diferentes a
  cada execução.
- Preparar documentos envolve preservar as relações necessárias à
  interpretação do texto.
- Exemplos pequenos e pseudocódigo com lacunas ajudaram a transformar o
  raciocínio em implementação.

## Limitações conhecidas

Estas limitações fazem parte do recorte do exercício e não impedem o objetivo
didático alcançado.

- A divisão atende apenas ao Markdown simples delimitado no exercício.
- Não há tratamento para títulos aninhados, blocos de código ou seções
  extensas.
- O `id` é baseado no nome da seção: renomear a seção muda o id.
- Duas seções com o mesmo nome no mesmo arquivo gerariam ids iguais.
- A união das linhas por espaço perde a formatação original, como quebras de
  linha e listas.
- A lógica de salvamento do trecho está repetida, dentro do loop e depois
  dele.

## Como executar

O módulo é executado com Node pelo WSL e usa apenas `tsx` e `typescript`
como dependências de desenvolvimento. Não precisa de API, credencial ou
embeddings.

Na pasta `07-chunking`:

```bash
npm install
npm run typecheck
npm start
```

`npm start` executa `src/exercicio.ts` e exibe os trechos, a fonte e a
quantidade de trechos produzidos.

## Validação

Nenhuma verificação foi executada durante a escrita desta documentação. As
evidências abaixo têm origens diferentes.

- Conferido em execução anterior, na conferência do exercício:
  `npm run typecheck` sem erros e a saída com os três trechos da seção de
  resultado.
- Relatado, sem reexecução: teste com uma seção sem conteúdo, em que a seção
  vazia não apareceu entre os trechos. O texto de teste não faz parte do
  código atual.
- Analisado pela leitura do código: a reprodutibilidade dos ids, que são
  formados apenas pela fonte e pelo nome da seção. Não houve comparação entre
  duas execuções.
- Discutido conceitualmente, sem execução: a variação com a seção
  “Exceções”.
