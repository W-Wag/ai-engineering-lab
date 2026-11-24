# 19-busca-hibrida

## Objetivo

Implementar o Reciprocal Rank Fusion (RRF) para combinar dois rankings
**simulados**, um lexical e um semântico, e investigar um limite da fusão: ela
só consegue ordenar os candidatos que recebe.

Não há busca lexical real, embeddings, reranker, filtros, API nem geração de
resposta. Os rankings e a relevância esperada são **fixtures**. O módulo
demonstra o algoritmo de fusão; não é uma busca híbrida completa nem mede a
qualidade de uma busca real.

## Contrato do RRF

Cada ocorrência de um trecho num ranking contribui com:

```text
contribuição = 1 / (constante + posição)
```

- **Posição:** começa em 1. O primeiro item contribui com 1/(constante + 1).
- **Constante:** 60 (`CONSTANTE_RRF`). Não é a quantidade de resultados.
- **Trecho ausente:** um trecho que não aparece numa lista recebe **0** dessa
  lista.
- **Soma:** as contribuições são somadas pelo ID, e cada ID aparece uma única
  vez na saída.
- **Ordenação:** pontuação decrescente. Em empate, o ID em ordem crescente, por
  comparação simples de strings (`<`, `>`), sem `localeCompare`.
- **Scores originais:** os scores das buscas de origem são só exibidos e não
  entram no cálculo. O RRF usa apenas a posição.
- **Arredondamento:** nenhum no cálculo. A apresentação mostra 6 casas.
- **Rankings vazios:** são permitidos. Duas listas vazias produzem um resultado
  vazio.
- **Listas de entrada:** não são alteradas.

## Estrutura

```text
19-busca-hibrida/
  src/
    tipos.ts                      Trecho, ItemDeRanking, Ranking, ResultadoRrf
    dados.ts                      catálogo fictício, rankings da construção, CONSTANTE_RRF, validarRanking
    apresentacao.ts               saída da construção
    rrf.ts                        contribuicao e fundirRrf
    exercicio.ts                  construção
    dados-investigacao.ts         catálogo com pol-06, pergunta, cenários A e B
    apresentacao-investigacao.ts  saída da investigação
    investigacao.ts               investigação
```

### Preparado pelo assistente

- A configuração e os scripts.
- Os tipos e as fixtures.
- A validação das fixtures: cada ID existe no catálogo e não se repete dentro
  da mesma lista.
- A apresentação, que é separada da fusão.
- A parte fixa dos executores.
- O cenário da investigação.

### Implementado por Wagner

- **Em `rrf.ts`:**
  - `contribuicao`;
  - a acumulação num `Map` do ID para as contribuições lexical e semântica, com
    `posicao = index + 1`;
  - a conversão para `ResultadoRrf[]` com `Array.from`;
  - a ordenação com `sort` e o desempate pelo ID.
- **Em `investigacao.ts`:**
  - a cópia das entradas para a conferência final;
  - a fusão dos cenários A e B;
  - a montagem do ranking de B;
  - a função `posicaoNoResultado`;
  - a conferência de que as entradas foram preservadas.

## Construção

O catálogo tem 5 trechos fictícios de políticas de atendimento, de `pol-01` a
`pol-05`. Os rankings são simulados:

| Posição | Lexical | Semântico |
|---|---|---|
| 1 | pol-02 | pol-03 |
| 2 | pol-01 | pol-05 |
| 3 | pol-04 | pol-02 |

Resultado, com constante 60:

| Ranking final | Lexical | Semântica | Pontuação |
|---|---|---|---|
| 1. pol-02 | 1/61 | 1/63 | 0,032266 |
| 2. pol-03 | 0 | 1/61 | 0,016393 |
| 3. pol-01 | 1/62 | 0 | 0,016129 |
| 4. pol-05 | 0 | 1/62 | 0,016129 |
| 5. pol-04 | 1/63 | 0 | 0,015873 |

- **O topo:** `pol-02` é o único trecho nas duas listas e fica em 1º.
- **O empate:** `pol-01` e `pol-05` empatam exatamente em 1/62, e o desempate
  pelo ID coloca `pol-01` antes.

**Erros corrigidos durante a construção.** Nenhum dos três foi detectado pelo
typecheck:

- um `1 +` a mais na fórmula, que fazia a conversão de índice para posição
  duas vezes;
- a falta do `Map.set`, que deixava o acumulado vazio;
- um `=` no lugar de `-` no comparador do `sort`, que sobrescrevia as
  pontuações.

## Investigação: o trecho existe, mas não chega à fusão

**Pergunta:** "Qual é o prazo de garantia contra defeitos de fabricação?"

O catálogo da investigação tem os 5 trechos da construção mais um:
`pol-06` (`politica-de-garantia.md`), que diz: "A garantia contra defeitos de
fabricação é de 12 meses a partir da data da compra."

O trecho esperado foi **escolhido à mão** na fixture, sem busca real nem
julgamento automático de relevância. Nenhum outro trecho responde à pergunta:
`pol-04` cita defeito, mas trata do frete; `pol-01` cita prazo, mas trata de
trocas.

| | Cenário A | Cenário B |
|---|---|---|
| lexical | pol-04, pol-01, pol-02 | o mesmo de A |
| semântico | pol-01, pol-04, pol-03 | pol-01, **pol-06**, pol-04, pol-03 |
| ranking fundido | pol-01, pol-04, pol-02, pol-03 | pol-01, pol-04, **pol-06**, pol-02, pol-03 |
| pol-06 | **ausente** | **posição 3** (1/62 ≈ 0,016129) |

- **Cenário A:** `pol-06` está no catálogo, mas não é candidato em nenhuma das
  duas listas. A fusão não tem como incluí-lo.
- **Cenário B:** `pol-06` é inserido na posição 2 do ranking semântico. Essa
  posição foi definida na fixture antes de qualquer execução, não escolhida
  depois para forçar o resultado. A ordem relativa dos demais itens foi
  preservada.
- **Itens deslocados:** a inserção também mudou a pontuação dos trechos que
  desceram uma posição no semântico:
  - `pol-04` foi de 1/61 + 1/62 para 1/61 + 1/63 e deixou de empatar com
    `pol-01`;
  - `pol-03` foi de 1/63 para 1/64.
- **Presente não é o mesmo que primeiro:** em B, `pol-06` fica em 3º lugar.
  Estar entre os candidatos não garante ficar em primeiro, nem entrar num
  top-2.
- **Entradas preservadas:** `LEXICAL_A` e `SEMANTICO_A` não foram alteradas. O
  ranking de B foi criado como um array novo.

**Interpretação do Wagner:** o problema do cenário A estava na **seleção de
candidatos**. O trecho nem chegou à fusão.

**Limite conceitual do reranker:** um reranker posterior reordenaria apenas os
candidatos recebidos e não recuperaria sozinho um trecho ausente. Este módulo
não implementa reranker.

## `toSpliced` e o target ES2023

O ranking de B é montado com
`SEMANTICO_A.toSpliced(INSERCAO_B.posicao - 1, 0, INSERCAO_B.item)`. Esse
método devolve um array novo e não altera o original.

O `tsconfig.json` usa `"target": "ES2023"` para que o TypeScript reconheça
`toSpliced`. O target só muda a verificação de tipos: **não adiciona
polyfill**. Por isso, o código precisa rodar num runtime que já tenha o método.
O Node 24, usado no laboratório, tem.

## Execução

Na raiz do repositório:

```powershell
npm install --prefix 19-busca-hibrida
```

Na pasta do módulo:

```powershell
cd 19-busca-hibrida
npm start            # construção
npm run investigar   # investigação, cenários A e B
npm run typecheck    # tsc --noEmit
```

## Verificações

Todas as verificações abaixo foram feitas pelo assistente durante a construção
e a investigação.

- **Typecheck:** sem erros nas versões finais.
- **`npm start` e `npm run investigar`:** saídas registradas nas seções
  anteriores, com "rankings de entrada preservados: sim" na construção e as
  entradas preservadas na investigação.
- **Roteiro temporário da construção,** com asserções contra valores
  calculados à mão e tolerância de 1e-12:
  - 1/61 e 1/63 para as posições 1 e 3;
  - a soma de `pol-02`;
  - os trechos que aparecem numa lista só;
  - nenhuma duplicação;
  - a ordem final com o desempate;
  - o desempate independente da ordem de entrada;
  - listas vazias;
  - as entradas preservadas.
- **Roteiro temporário da investigação,** com asserções:
  - A não contém `pol-06`;
  - B contém `pol-06` uma vez, na posição 3;
  - a contribuição de `pol-06` é igual a 1/(60+2), calculada pela fórmula e não
    pela implementação;
  - nenhum ID inventado;
  - as entradas preservadas.

Os roteiros temporários ficaram fora do módulo e **não** são uma suíte
permanente.

Pelo método adotado neste módulo, o Wagner implementou e o assistente executou
e verificou.

## Limitações

- **Fixtures:** os rankings e a relevância esperada foram definidos à mão. Não
  há busca lexical, embeddings, reranker, filtros, API nem geração.
- **Inclusão manual:** inserir `pol-06` à mão não demonstra melhoria de uma
  recuperação real.
- **O que o módulo mostra:** o funcionamento da fusão e a dependência dos
  candidatos disponíveis, não a qualidade nem a suficiência das fontes.
- **Constante fixa:** a constante é 60, e o efeito de outros valores não foi
  explorado.
- **Testes:** não há suíte de testes no módulo.
