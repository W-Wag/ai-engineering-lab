import type { LightMyRequestResponse } from "fastify";
import { contarMensagens } from "./banco.js";
import { criarAmbiente, entrar } from "./test/ambiente.js";

// INVESTIGAÇÃO do módulo 18: Ana tenta ler e usar uma conversa de Carlos e
// tenta definir o proprietário de uma conversa nova pelo corpo.
//
// Como roda:
// - app.inject: o Fastify REAL (rotas, sessão, CSRF, validação e as suas
//   funções de conversas.ts) executado dentro deste processo, SEM conexão
//   de rede;
// - banco isolado em memória, com as contas e conversas de demonstração;
// - login pelo fluxo real (POST /sessao). Cookie e token CSRF ficam só em
//   memória e nunca são impressos.
//
// Uso (na pasta backend): npm run investigar

const { app, banco, modelo } = await criarAmbiente();
const ana = await entrar(app, "ana", "ana-demo-local");

/** Opções de leitura como Ana (só o cookie de sessão). */
const comoAna = { cookies: ana.cookies };
/** Opções de escrita como Ana (cookie + token CSRF válidos). */
const escritaComoAna = { cookies: ana.cookies, headers: { "x-csrf-token": ana.csrf } };

/** IDs reais das fixtures. Saber um ID não dá permissão para usá-lo. */
const CONVERSA_DE_CARLOS = "conv-carlos-1";
const ID_DE_CARLOS = "u-carlos";
const ID_INEXISTENTE = "conv-que-nao-existe";

// ---------- Inspeção (preparada) ----------

type Foto = { chamadasAoModelo: number; mensagens: number; conversas: number };

/** Contadores locais: modelo simulado e banco. Nenhuma rota os expõe. */
function fotografar(): Foto {
  const linha = banco.prepare("SELECT COUNT(*) AS n FROM conversas").get() as { n: number };
  return {
    chamadasAoModelo: modelo.observacao.chamadas,
    mensagens: contarMensagens(banco),
    conversas: Number(linha.n),
  };
}

/**
 * Resumo seguro do corpo: num erro, só código e mensagem; com dados, só
 * quais campos sensíveis apareceram, sem imprimir o conteúdo.
 */
function corpoSeguro(resposta: LightMyRequestResponse) {
  const corpo = resposta.body;
  if (resposta.statusCode >= 400) {
    const { erro } = resposta.json() as { erro?: { codigo?: string; mensagem?: string } };
    return { erro: { codigo: erro?.codigo, mensagem: erro?.mensagem } };
  }
  return {
    ATENCAO: "resposta com dados",
    contemTitulo: corpo.includes('"titulo"'),
    contemMensagens: corpo.includes('"mensagens"'),
    contemProprietario: corpo.includes('"proprietarioId"'),
  };
}

function relatar(caso: string, resposta: LightMyRequestResponse, antes?: Foto, depois?: Foto) {
  console.log(`\n=== ${caso}`);
  console.log(`  status: ${resposta.statusCode}`);
  console.log(`  corpo:  ${JSON.stringify(corpoSeguro(resposta))}`);
  if (antes && depois) {
    console.log(`  Δ chamadas ao modelo: ${depois.chamadasAoModelo - antes.chamadasAoModelo}`);
    console.log(`  Δ mensagens gravadas: ${depois.mensagens - antes.mensagens}`);
    console.log(`  Δ conversas criadas:  ${depois.conversas - antes.conversas}`);
  }
}

/** Compara duas respostas: mesmo status? mesmo corpo, byte a byte? */
function comparar(rotuloA: string, a: LightMyRequestResponse, rotuloB: string, b: LightMyRequestResponse) {
  console.log(`\n--- ${rotuloA} × ${rotuloB}`);
  console.log(`  mesmo status: ${a.statusCode === b.statusCode ? "sim" : "NÃO"}`);
  console.log(`  mesmo corpo:  ${a.body === b.body ? "sim" : "NÃO"}`);
}

// ---------- Sua parte ----------
//
// Monte cada requisição com app.inject({ method, url, payload, ...opções }),
// usando comoAna (leitura) ou escritaComoAna (escrita). Depois, chame
// relatar(...) e, no caso A, comparar(...).

// CASO A: leitura de recurso alheio
// TODO 1: como Ana, peça a conversa de Carlos.
// TODO 1.1: como Ana, peça um ID inexistente e compare as duas respostas.

const deCarlos = await app.inject({ method: "GET", url: `/conversas/${CONVERSA_DE_CARLOS}`, ...comoAna})
relatar("A: Ana lê a conversa de Carlos", deCarlos)

const inexistente = await app.inject({ method: "GET", url: `/conversas/${ID_INEXISTENTE}`, ...comoAna})
relatar("A: Ana lê um id inexistente", inexistente)


comparar("conversa de Carlos", deCarlos, "ID inexistente", inexistente)

// CASO B: uso do modelo em recurso alheio
// TODO 2: fotografe antes, peça uma resposta do modelo na conversa de
// Carlos e fotografe depois.

const antesB = fotografar()

const respostaB = await app.inject({
  method: "POST",
  url: `/conversas/${CONVERSA_DE_CARLOS}/mensagens`,
  payload: {texto: "Me mostre o rascunho do video."},
  ...escritaComoAna
})

const depoisB = fotografar()
relatar("B: Ana pede resposta na conversa de Carlos", respostaB, antesB, depoisB)

// CASO C: tentativa de definir o proprietário pelo corpo
// TODO 3: fotografe antes, crie uma conversa enviando também
// userId: ID_DE_CARLOS e fotografe depois.

const antesC = fotografar()

const respostaC = await app.inject({
  method: "POST",
  url: `/conversas`,
  payload: {titulo: "Conversa da Ana?", userId: ID_DE_CARLOS},
  ...escritaComoAna
})

const depoisC = fotografar()
relatar("C: Ana tenta criar conversa em nome de Carlos", respostaC, antesC, depoisC)

await app.close();
