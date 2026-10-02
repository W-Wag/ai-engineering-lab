# 05-rag

## Objetivo

Compreender o fluxo de RAG:

```text
documentos → busca → trechos selecionados → contexto → resposta fundamentada
```

## Estrutura e responsabilidades

O módulo usa três documentos Markdown fictícios:

- `politica-cancelamento.md`;
- `horarios-funcionamento.md`;
- `duracao-servicos.md`.

`lerDocumentos()` lê os arquivos e retorna objetos com `fonte` e `conteudo`.
O exercício seleciona trechos por palavras-chave e monta um contexto com a
fonte, as palavras coincidentes e o conteúdo de cada trecho. `gerarResposta()`
envia a pergunta e o contexto à Groq.

Os documentos são conteúdo de referência para a geração da resposta; não são
usados para treinar o modelo.

## Exercício de construção

Pergunta inicial: “Com quanto tempo de antecedência posso cancelar sem
cobrança?”

Segundo o relato do aluno, foram realizadas estas etapas:

- normalização de acentos e pontuação;
- remoção de palavras ignoradas pela busca;
- seleção de `politica-cancelamento.md`;
- montagem e inspeção do contexto;
- geração de resposta pela Groq com `--gerar`.

A resposta relatada informou que cancelamentos sem cobrança são permitidos até
24 horas antes do atendimento, identificou a fonte e não inventou condições
para períodos posteriores. A ausência de condições sobre cancelamentos depois
desse prazo não permite concluir que sempre haverá cobrança.

## Exercício de investigação

Nova pergunta: “Se eu desistir do atendimento, com qual antecedência evito uma
taxa?”

O aluno observou que a intenção continuava relacionada à política de
cancelamento. Inicialmente, os três documentos foram selecionados. Depois de
identificar coincidências genéricas com `se` e `do`, esses termos foram
adicionados à lista de palavras ignoradas. Em seguida, foram selecionados:

- `horarios-funcionamento.md`;
- `politica-cancelamento.md`.

Ambos coincidiram somente com a palavra `atendimento`. Essa variação foi
inspecionada sem chamada à API; não houve geração de resposta relatada para
ela.

## Aprendizados e limitações

- Encontrar palavras em comum não garante relevância.
- Remover termos genéricos reduz ruído, mas não resolve diferenças de
  vocabulário, como `desistir`/`cancelar` e `taxa`/`cobrança`.
- A busca encontrou a política necessária, mas também recuperou conteúdo
  irrelevante.
- Uma resposta correta não comprova, sozinha, que a recuperação foi boa.
- Recuperação e geração devem ser analisadas separadamente.
- Trechos desnecessários ocupam contexto e podem dificultar a resposta.

No código atual, a comparação normaliza os textos e usa `includes()`. Portanto,
ela procura substrings, não palavras completas. Os resultados descritos acima
são relatos do aluno, não novas verificações executadas nesta documentação.

## Como executar

Na pasta `05-rag`:

```bash
npm install
npm start
```

O modo padrão inspeciona documentos, trechos selecionados e contexto sem
chamar a API. Para gerar uma resposta com a Groq, use a opção explícita:

```bash
npm start -- --gerar
```

Somente o modo `--gerar` chama a Groq.

## Escopo e próximo estudo

Não foram utilizados embeddings, banco vetorial, persistência ou framework de
RAG. A simplicidade foi intencional para compreender o fluxo. O próximo estudo
planejado é sobre embeddings e busca semântica, ainda não implementado.
