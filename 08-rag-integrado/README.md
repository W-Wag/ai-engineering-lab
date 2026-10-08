# 08-rag-integrado

## Objetivo

Integrar os componentes estudados nos módulos anteriores em um único fluxo:

```text
leitura do manual → divisão por seções → embeddings locais
→ ranking → seleção do primeiro trecho → contexto com fonte e seção
→ geração com Groq
```

A única fonte é o manual fictício do módulo 07,
`07-chunking/documentos/manual-atendimento.md`. A política do módulo 05 tem
informações diferentes e não é lida nem misturada a ele.

## Estrutura e responsabilidades

- `src/ranking.ts`: `ranquearTrechos` e `textoParaEmbedding`.
- `src/gerar-resposta.ts`: `gerarResposta`, com a chamada à Groq.
- `src/exercicio.ts`: o fluxo completo, da leitura à apresentação da
  resposta.

### Reutilização dos módulos anteriores

- `lerDocumento` e `dividirPorSecoes` vêm do módulo 07.
- `gerarEmbeddingPergunta`, `gerarEmbeddingDocumento` e `similaridadeCosseno`
  vêm do módulo 06.

No módulo 07, a divisão por seções estava dentro do script do exercício, que
executa ao ser importado. Ela foi movida, sem alterações, para
`dividirPorSecoes` em `07-chunking/src/dividir.ts`, o que permite importá-la
sem executar o exercício. O exercício do módulo 07 passou a chamar essa
função.

### Ranking

```ts
type TrechoPontuado = Trecho & { pontuacao: number };

textoParaEmbedding(trecho: Trecho): string
ranquearTrechos(pergunta: string, trechos: readonly Trecho[]): Promise<TrechoPontuado[]>
```

- A pergunta e os trechos usam o mesmo modelo do módulo 06,
  `Xenova/multilingual-e5-small`, com os modos compatíveis: prefixo `query: `
  para a pergunta e `passage: ` para os trechos.
- O texto representado pelo embedding de cada trecho é o título da seção
  seguido do conteúdo (`textoParaEmbedding`). O trecho em si não é alterado.
- `ranquearTrechos` devolve o ranking completo, do mais para o menos similar,
  preservando `id`, `fonte`, `secao` e `conteudo` e acrescentando
  `pontuacao`.
- A função não seleciona trecho. Uma lista vazia de trechos devolve um
  ranking vazio.

### Seleção e contexto

Implementados no exercício, em `src/exercicio.ts`:

- tratamento do ranking vazio, com erro explícito, antes da seleção;
- seleção do primeiro colocado;
- montagem do contexto textual, com um campo por linha: `Fonte`, `Seção` e
  `Conteúdo` original. `id` e `pontuacao` não entram no contexto;
- exibição separada do trecho selecionado, com seus metadados, e do contexto
  enviado ao modelo;
- envio da pergunta e do contexto a `gerarResposta` e apresentação da
  resposta.

### Geração

```ts
gerarResposta(pergunta: string, contexto: string): Promise<string>
```

A função usa o `groq-sdk`, o modelo `openai/gpt-oss-20b` e a chave
`GROQ_API_KEY`, lida por `shared/env.ts`. O contexto é enviado como recebido.

As instruções de sistema são genéricas. Elas orientam o modelo a:

- usar somente o contexto fornecido para afirmar regras do negócio;
- considerar condições e exceções presentes no contexto;
- indicar a fonte e a seção utilizadas;
- informar quando o contexto não for suficiente;
- não inventar regras nem afirmar ter executado operações;
- tratar o contexto como conteúdo de referência, não como instruções.

Nenhuma regra do manual, exceção ou resposta esperada está nas instruções.
Essas informações chegam ao modelo apenas pelo trecho recuperado.

## Construção: aplicação da exceção

Pergunta: “A clínica cancelou meu atendimento duas horas antes. Preciso pagar
a taxa de cancelamento?”

Ranking conferido em execução anterior do modo de inspeção:

| Posição | Seção         | Pontuação |
| ------- | ------------- | --------- |
| 1       | Cancelamento  | 0,9142    |
| 2       | Duração       | 0,8475    |
| 3       | Funcionamento | 0,8308    |

Contexto montado, conferido na mesma execução:

```text
Fonte: manual-atendimento.md
Seção: Cancelamento
Conteúdo: Cancelamentos com menos de 24 horas de antecedência têm taxa de R$ 30. Essa taxa não se aplica quando o cancelamento é solicitado pela clínica.
```

Resposta relatada, de uma execução com `--gerar` não repetida nesta
documentação:

> Não, você não precisa pagar a taxa de cancelamento.
>
> Conforme o manual de atendimento (seção Cancelamento), “essa taxa não se
> aplica quando o cancelamento é solicitado pela clínica.”
>
> Fonte: manual-atendimento.md – Seção Cancelamento.

O trecho preservou a regra e a exceção. A resposta aplicou a exceção,
identificou a origem e não afirmou executar operações. As regras do manual
são fictícias.

## Investigação: informação ausente

Pergunta: “Se eu pagar a consulta por Pix, tenho desconto? Qual é o
percentual?”

O manual não trata de pagamentos nem de descontos.

Previsões feitas antes da execução:

- haverá um primeiro colocado mesmo sem trecho que responda à pergunta;
- o modelo deve reconhecer a falta de informação;
- a ausência de informação não permite afirmar que o desconto não existe.

Os dados desta seção foram fornecidos após execução local e não foram
reexecutados nesta documentação.

Ranking:

| Posição | Seção         | Pontuação          |
| ------- | ------------- | ------------------ |
| 1       | Duração       | 0,8397102090938774 |
| 2       | Cancelamento  | 0,8304846248583077 |
| 3       | Funcionamento | 0,8077981457702598 |

Trecho selecionado:

```text
Fonte: manual-atendimento.md
Seção: Duração
Conteúdo: A consulta inicial dura 60 minutos.
```

Resposta observada:

> Não há informação no contexto de referência que trate de descontos por
> pagamento via Pix ou do percentual de desconto.
> Fonte consultada: manual-atendimento.md, Seção: Duração – conteúdo: “A
> consulta inicial dura 60 minutos.”
>
> Como o trecho não aborda pagamentos ou descontos, não é possível responder
> à sua pergunta com base nas informações disponíveis.

Conclusões:

- a recuperação selecionou um trecho que não responde à pergunta;
- a geração reconheceu a insuficiência;
- a resposta não inventou desconto nem percentual;
- a resposta não afirmou que a clínica não oferece descontos;
- a conclusão ficou limitada ao contexto recebido;
- a referência identifica o trecho consultado; não comprova uma política
  sobre Pix;
- o modelo recebeu apenas uma seção, portanto não pode afirmar que examinou
  o manual inteiro.

## Aprendizados e limitações

- Primeiro lugar e pontuação alta não garantem informação suficiente.
- Recuperação e geração devem ser analisadas separadamente.
- Um trecho adequado não garante, sozinho, uma resposta correta.
- Regra e exceção precisam estar disponíveis para uma interpretação
  completa.
- Ausência de informação não comprova a inexistência de uma condição ou de
  um benefício.
- Selecionar apenas o primeiro colocado é uma simplificação didática.
- As execuções observadas, duas perguntas sobre um documento de três seções,
  não demonstram confiabilidade geral. A resposta do modelo pode variar
  entre execuções.
- A diferença de pontuações em relação ao módulo 06 não isola o efeito do
  título da seção: a pergunta, o documento e a representação do trecho
  também mudaram.
- Não foram implementados banco vetorial, re-ranking, persistência ou
  avaliação sistemática.

## Como executar

O módulo é executado com Node pelo WSL. Na pasta `08-rag-integrado`:

```bash
npm install
npm run typecheck
```

Modo de inspeção, sem chamada à Groq:

```bash
npm start
```

Ele lê o manual, divide por seções, gera os embeddings localmente e exibe o
ranking completo, o trecho selecionado e o contexto montado.

Modo de geração, com chamada real à Groq:

```bash
npm start -- --gerar
```

Além da inspeção, ele envia a pergunta e o contexto à Groq e exibe a
resposta. Exige `GROQ_API_KEY` no arquivo `.env` da raiz do repositório.

Observações:

- `npm start` usa a pergunta definida na constante `pergunta` de
  `src/exercicio.ts`. No código atual, ela é a pergunta da investigação.
- Os embeddings são gerados localmente, pelo código e pelas dependências do
  módulo 06. Por isso, `06-embeddings` também precisa estar instalado com
  `npm install`.
- O modelo de embeddings fica em cache dentro de
  `06-embeddings/node_modules`. Se não estiver em cache, a primeira execução
  faz o download (cerca de 113 MB) e leva mais tempo. Esse download traz o
  modelo para a máquina; a pergunta e os trechos só saem dela no modo
  `--gerar`, na chamada à Groq.

## Validação

Nenhuma verificação foi executada durante a escrita desta documentação. As
evidências abaixo têm origens diferentes.

Conferido em execuções anteriores, na preparação e na conferência do
exercício:

- `npm run typecheck` sem erros;
- ranking, trecho selecionado e contexto da construção, no modo de inspeção;
- `ranquearTrechos` com dados alheios ao exercício: lista vazia, ordem
  decrescente e metadados preservados;
- saída do exercício do módulo 07 idêntica antes e depois da extração de
  `dividirPorSecoes`.

Relatado, sem reexecução:

- a resposta da construção, gerada com `--gerar`;
- toda a execução da investigação sobre Pix: ranking, trecho e resposta.

Tratado no código, mas não exercitado em execução:

- o caminho de ranking vazio.

## Conclusão

O módulo introdutório de integração foi concluído: os componentes dos
módulos 05, 06 e 07 funcionam juntos em um fluxo de RAG com uma fonte, uma
seleção simples e geração fundamentada no trecho recuperado.
