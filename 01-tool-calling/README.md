# Estudo 01 — Tool calling

## Objetivo

Entender e implementar tool calling com TypeScript e Gemini.

O cenário é uma consulta, feita no terminal, sobre os horários disponíveis de uma profissional em uma data. Os dados são fictícios e não há interface, banco de dados ou criação de reservas.

## Conceito aprendido

Ferramentas permitem que o modelo solicite consultas e ações disponíveis na aplicação. O modelo solicita; a aplicação valida os argumentos e executa a função correspondente.

A descrição da ferramenta é um contrato enviado ao modelo. Ela informa o nome, a finalidade e o formato dos argumentos esperados. Ela não executa código.

A função `consultarDisponibilidade` é o código da aplicação que realiza a consulta. O modelo não executa essa função diretamente: ele produz uma solicitação, e a aplicação decide se pode executá-la.

## Fluxo implementado

1. O usuário envia um pedido.
2. O modelo solicita a ferramenta `consultarDisponibilidade`.
3. A aplicação identifica uma etapa com `step.type === "function_call"`.
4. A aplicação confere o nome da ferramenta e valida os argumentos.
5. A aplicação executa `consultarDisponibilidade`.
6. A aplicação envia o resultado ao modelo em uma segunda chamada, usando `function_result`.
7. O modelo usa o resultado para responder ao usuário.

As duas chamadas à API têm papéis diferentes:

- A primeira envia o pedido do usuário e a declaração da ferramenta. A resposta pode conter uma solicitação `function_call`.
- A segunda envia o resultado da função, associando-o à chamada por meio de `previous_interaction_id`, `name` e `call_id`. O modelo então produz a resposta final.

No arquivo `src/teste-gemini-tool.ts`, a segunda chamada está mantida como código comentado durante o estudo. A execução local da função e a impressão do resultado estão ativas.

## Validação dos argumentos

Os dados recebidos da ferramenta são tratados como `unknown`, pois a aplicação não deve confiar automaticamente no formato recebido. A função `eConsultaValida` funciona como um predicado de tipo (`valor is ConsultaDisponibilidade`).

Ela retorna `true` somente quando o valor é um objeto não nulo, não é um array e possui `profissionalId` e `data`, ambos do tipo `string`.

Essa validação é estrutural e não verifica se a data existe no calendário, se está no formato correto ou se a profissional está cadastrada.

Quando a aplicação recebe texto JSON, `JSON.parse` pode falhar e produzir o caso “JSON inválido”. Depois de um JSON válido, o objeto ainda pode ter estrutura inválida, como ausência de `data` ou `data` com tipo numérico. Na integração atual com o SDK do Gemini, `step.arguments` já é entregue como objeto; por isso, não é necessário usar `JSON.parse` antes de `eConsultaValida`.

## Como executar

Na pasta `01-tool-calling`, instale as dependências:

```bash
npm install
```

Para executar o teste básico do Gemini:

```bash
npx tsx src/teste-gemini.ts
```

Para executar o teste com declaração e chamada de ferramenta:

```bash
npx tsx src/teste-gemini-tool.ts
```

Para verificar os tipos sem gerar arquivos:

```bash
npm run typecheck
```

Configure a chave em `01-tool-calling/.env`, sem versioná-la:

```env
GEMINI_API_KEY=seu-placeholder-aqui
```

O projeto usa `tsx` para executar TypeScript, `typescript` para a verificação de tipos, `@google/genai` como SDK e `dotenv` para carregar a variável de ambiente.

## Validações realizadas

### Testes manuais relatados

Conforme os testes manuais realizados pelo estudante:

- Ana na data cadastrada retorna `09:00` e `14:00`.
- Carlos retorna uma lista vazia.
- Argumentos sem data ou com tipo incorreto são rejeitados.
- Uma ferramenta desconhecida é recusada.

Esses testes não são automatizados nem foram executados por este documento.

### Integração real confirmada

Conforme a execução real relatada pelo estudante:

- O Gemini solicitou `consultarDisponibilidade` com os argumentos esperados.
- A aplicação executou a função.
- O resultado foi enviado ao modelo.
- A resposta final apresentou corretamente os horários da Ana.

## Limitações e pendências

- Os dados são fictícios e não há banco de dados.
- A validação estrutural não garante que a data seja válida no calendário.
- Uma lista vazia não distingue profissional inexistente de profissional sem horários.
- Ainda falta avaliar pedidos incompletos e respostas sem horários.
- Testes adicionais com a API foram interrompidos por esgotamento da cota gratuita.
