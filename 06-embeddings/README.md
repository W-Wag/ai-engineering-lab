# 06-embeddings

## Objetivo

Comparar uma pergunta com documentos por meio de embeddings, ordenar os
documentos por similaridade e selecionar um trecho, preservando seu conteúdo
original e sua fonte:

```text
documentos e pergunta → embeddings compatíveis → similaridade
→ ranking → seleção do texto original e da fonte
```

O vetor serve apenas para a busca. O que fundamentaria uma resposta de um
modelo gerador é o texto original do trecho selecionado, acompanhado da fonte;
por isso os três campos são mantidos juntos.

Este módulo vai até a seleção do trecho. Não há chamada à Groq nem geração de
resposta.

## Estrutura e responsabilidades

- `src/embeddings.ts`: carrega o modelo e gera embeddings de pergunta e de
  documento.
- `src/similaridade.ts`: calcula a similaridade do cosseno entre dois vetores.
- `src/exercicio.ts`: percorre os documentos, pontua, ordena, seleciona e
  exibe o ranking.

Os documentos não foram copiados. O exercício importa `lerDocumentos()` de
`05-rag/src/documentos.ts`, que lê os três arquivos Markdown fictícios de
`05-rag/documentos`:

- `politica-cancelamento.md`;
- `horarios-funcionamento.md`;
- `duracao-servicos.md`.

Cada documento é tratado como um único trecho, com o texto completo.

## Infraestrutura

### Modelo e biblioteca

- Modelo: `intfloat/multilingual-e5-small`, na conversão ONNX
  `Xenova/multilingual-e5-small` (constante `MODELO_EMBEDDINGS`).
- Variante: `dtype: "q8"`, que seleciona o arquivo quantizado
  `onnx/model_quantized.onnx`.
- Biblioteca: `@huggingface/transformers` (`^4.3.1`), pipeline
  `feature-extraction`.
- Dimensão dos vetores: 384 (constante `DIMENSOES_EMBEDDING`).
- Pooling e normalização configurados: `pooling: "mean"` e `normalize: true`.
- Limite do modelo: textos acima de 512 tokens são truncados.

### Execução local e primeiro download

O modelo roda localmente, em CPU, sem credencial e sem serviço pago. O arquivo
`.env` do repositório não é usado neste módulo.

Na primeira execução, a biblioteca baixa os arquivos do modelo do Hugging Face
Hub (cerca de 113 MB) e os guarda em
`node_modules/@huggingface/transformers/.cache`. Esse download traz o modelo
para a máquina; ele não envia a pergunta nem os documentos a um serviço
remoto. A geração dos embeddings acontece no processo Node local, e depois do
primeiro download a rede deixa de ser necessária.

### Prefixos de pergunta e de documento

O E5 foi treinado com prefixos no texto de entrada. Em busca de perguntas em
documentos, a pergunta recebe `query: ` e o documento recebe `passage: `. As
funções aplicam o prefixo internamente; quem chama passa o texto original.
Usar a função errada para um dos lados gera um vetor diferente e deixa a
comparação fora do modo para o qual o modelo foi treinado.

### Funções auxiliares e contratos

```ts
// src/embeddings.ts
gerarEmbeddingPergunta(pergunta: string): Promise<number[]>
gerarEmbeddingDocumento(conteudo: string): Promise<number[]>

// src/similaridade.ts
similaridadeCosseno(a: readonly number[], b: readonly number[]): number
```

- `gerarEmbeddingPergunta` e `gerarEmbeddingDocumento` devolvem um vetor
  normalizado de 384 posições e lançam erro para texto vazio. O pipeline é
  carregado uma única vez e reutilizado entre as chamadas.
- `similaridadeCosseno` devolve o produto escalar dividido pelo produto das
  normas, entre -1 e 1.

`similaridadeCosseno` lança erro, em vez de devolver um número, quando a
comparação não tem significado:

- vetores vazios;
- dimensões incompatíveis;
- vetor de norma zero, caso em que o cosseno é indefinido;
- valor que não é um número finito.

## Implementação do exercício

Em `src/exercicio.ts` foram implementados:

- geração do embedding de cada documento;
- preservação de fonte e conteúdo original junto ao embedding
  (`DocumentoComEmbedding`);
- geração do embedding da pergunta;
- cálculo da pontuação de cada documento (`DocumentoPontuado`);
- ordenação decrescente por pontuação;
- seleção do primeiro colocado;
- apresentação do ranking e do trecho selecionado, com a fonte;
- erro explícito quando a lista de documentos está vazia, logo após a
  leitura.

A ordenação e a seleção ficam visíveis no próprio exercício, sem função
auxiliar que as esconda.

## Exercício de construção

Pergunta: “Se eu desistir do atendimento, com qual antecedência evito uma
taxa?”

Ranking conferido em execução anterior do exercício:

| Posição | Fonte                       | Pontuação |
| ------- | --------------------------- | --------- |
| 1       | `politica-cancelamento.md`  | 0,8656    |
| 2       | `horarios-funcionamento.md` | 0,8541    |
| 3       | `duracao-servicos.md`       | 0,8490    |

A política ficou em primeiro mesmo com diferenças de vocabulário entre a
pergunta e o documento, como `desistir`/`cancelamentos` e `taxa`/`cobrança`.
No módulo 05, a busca por palavras-chave selecionava a política e os horários
juntos para essa mesma pergunta.

Isso descreve o resultado deste exemplo. Não demonstra superioridade universal
da busca por embeddings sobre a busca lexical.

## Experimento com texto repetido

Os três documentos contêm a mesma frase: “Este documento é fictício e serve
apenas para o exercício.” Para observar seu efeito, a frase foi removida
temporariamente dos três textos antes da geração dos embeddings.

| Condição     | Política | Funcionamento | Duração | 1º − 2º |
| ------------ | -------- | ------------- | ------- | ------- |
| Com a frase  | 0,8656   | 0,8541        | 0,8490  | 0,0115  |
| Sem a frase  | 0,8729   | 0,8515        | 0,8451  | 0,0214  |

Os valores sem a frase são relatados; essa variação não foi reexecutada na
conferência do exercício nem nesta documentação. A mudança experimental foi
revertida, e o código atual gera os embeddings a partir do conteúdo completo.

O que o experimento permite afirmar:

- remover o texto comum alterou as três pontuações;
- neste caso, a diferença entre o primeiro e o segundo colocados aumentou.

O que ele não permite afirmar:

- que texto repetido sempre aproxima vetores;
- que “metade da média era igual” nos três documentos. Contar palavras não
  sustenta essa afirmação: palavras e tokens não são equivalentes, e a
  representação de cada token depende do contexto em que ele aparece, de modo
  que a mesma frase não produz as mesmas representações em textos diferentes;
- que a variação exata das pontuações decorre de uma proporção de palavras.

O mean pooling ajuda a entender o mecanismo: o vetor final resume as
representações de todos os tokens do texto, incluindo os da frase comum. Ele
não autoriza atribuir a mudança dos scores a uma conta simples.

## Investigação final: relevância e informação suficiente

Pergunta: “Qual é o valor da multa se eu cancelar duas horas antes do
atendimento?”

Ranking relatado, não reexecutado nesta documentação:

| Posição | Fonte                       | Pontuação          |
| ------- | --------------------------- | ------------------ |
| 1       | `politica-cancelamento.md`  | 0,8805548418098282 |
| 2       | `horarios-funcionamento.md` | 0,8670871223558188 |
| 3       | `duracao-servicos.md`       | 0,8541040542328648 |

A política ficou em primeiro, mas o documento informa apenas que
cancelamentos sem cobrança são permitidos até 24 horas antes do atendimento.
Ele não diz se existe multa nem qual seria o seu valor para um cancelamento
duas horas antes.

Uma pontuação alta indica similaridade segundo a comparação utilizada. Ela
não prova que o trecho contém a resposta e não é uma probabilidade de acerto.

Neste cenário, apenas o ranking foi executado; nenhuma resposta foi gerada.

## Critérios e limitações

- O primeiro colocado é o trecho mais similar entre os disponíveis; isso não
  significa que ele traz informação suficiente.
- Um corte fixo escolhido arbitrariamente pode falhar. Nos rankings acima, as
  três pontuações ficam a menos de 0,03 uma da outra, e o model card do E5
  avisa que suas similaridades se concentram entre 0,7 e 1,0.
- Limiares não são necessariamente inúteis: precisam ser avaliados para o
  modelo, os dados e a tarefa.
- Estes exercícios não demonstram um limiar universal.
- A ordem dos documentos não deve ser atribuída exclusivamente a uma palavra
  compartilhada. Não há evidência, por exemplo, de que os horários fiquem em
  segundo apenas por conterem `atendimento`.
- Os resultados vêm de três documentos curtos e duas perguntas.
- Não foram implementados banco vetorial, re-ranking, Cross-Encoder,
  persistência ou geração de respostas.

## Como executar

O módulo é executado com Node pelo WSL. As dependências incluem binários
nativos do `onnxruntime-node`, portanto a instalação e a execução devem ser
feitas no mesmo ambiente, sem misturar executáveis Windows com dependências
Linux. A preparação usou Node v24.21.0.

Na pasta `06-embeddings`:

```bash
npm install
npm run typecheck
npm start
```

- `npm install` ocupa cerca de 762 MB em `node_modules`, dos quais 548 MB são
  do `onnxruntime-node`.
- O npm não executa os scripts de instalação de `onnxruntime-node` e
  `protobufjs`, que não estão em `allowScripts`. A execução em CPU funcionou
  sem eles.
- A primeira chamada de embedding baixa o modelo e leva mais tempo; as
  seguintes usam o cache local.
- `npm start` executa `src/exercicio.ts` com a pergunta definida na constante
  `pergunta`. No código atual, ela é a pergunta da investigação final.

## Verificações

Nenhuma verificação foi executada durante a escrita desta documentação. Os
registros abaixo têm origens diferentes.

Conferido em execuções anteriores, durante a preparação e a conferência do
exercício:

- `npm run typecheck` sem erros;
- `similaridadeCosseno` com vetores fictícios: vetores iguais, proporcionais,
  ortogonais e opostos, além dos erros para dimensões incompatíveis, norma
  zero, vetores vazios e valor não finito. Esses testes são numéricos e não
  usam o modelo;
- modelo real com frases alheias ao exercício: vetores de 384 posições, norma
  1, prefixo alterando o vetor e frase relacionada com pontuação maior que a
  não relacionada;
- `npm start` com a pergunta do exercício de construção, com o ranking da
  seção correspondente.

Relatado, sem reexecução:

- pontuações do experimento sem a frase repetida;
- ranking da investigação final.

Conclusões conceituais, que não são medições:

- o papel do vetor na busca e do texto original na fundamentação;
- a diferença entre similaridade e informação suficiente;
- as ressalvas sobre limiares e sobre o efeito do texto repetido.
