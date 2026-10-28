import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type Groq from "groq-sdk";
import { SESSAO_FICTICIA, ServicoDeAgendamentos } from "../agendamentos.js";
import { construirApp } from "../app.js";
import { abrirBanco, buscarProposta, contarAgendamentos } from "../banco.js";
import { INSTRUCOES_SYSTEM } from "../instrucoes.js";
import { criarProcessadorDeRodada } from "../rodada.js";
import { semUso, type ModeloSimples } from "./modelo-simulado.js";

// app.inject (Fastify dentro do processo, sem rede) com modelo simulado, sem
// Groq. "Reiniciar" = fechar app e banco e montar outros sobre o mesmo
// arquivo.

let historicoVisto: readonly Groq.Chat.ChatCompletionMessageParam[] = [];

const modelo: ModeloSimples = async (mensagens) => {
  historicoVisto = mensagens;
  const ultima = mensagens.at(-1)!;
  if (ultima.role === "tool") {
    return { role: "assistant", content: "Proposta preparada.", refusal: null };
  }
  if (ultima.content === "agendar") {
    return {
      role: "assistant",
      content: null,
      refusal: null,
      tool_calls: [{
        id: "t1",
        type: "function",
        function: {
          name: "prepararPropostaAgendamento",
          arguments: JSON.stringify({ profissionalId: "ana", data: "2026-10-20", horario: "09:00" }),
        },
      }],
    };
  }
  if (ultima.content === "falhar") throw new Error("falha simulada");
  return { role: "assistant", content: `ok: ${String(ultima.content)}`, refusal: null };
};

function subir(caminho: string, sessao = SESSAO_FICTICIA) {
  const banco = abrirBanco(caminho);
  const agendamentos = new ServicoDeAgendamentos(banco);
  const app = construirApp({
    processarRodada: criarProcessadorDeRodada(semUso(modelo), {
      buscarPoliticas: async () => ({ encontrado: false }),
      agendamentos,
      sessao,
    }),
    instrucoesSystem: INSTRUCOES_SYSTEM,
    banco,
    agendamentos,
    sessao,
  });
  return {
    banco,
    app,
    desligar: async () => {
      await app.close();
      banco.close();
    },
  };
}

// Pastas temporárias são apagadas só no fim do arquivo, depois que os testes
// fecharam seus bancos: no Windows, um arquivo aberto não pode ser removido.
const pastasTemporarias: string[] = [];
after(() => {
  for (const pasta of pastasTemporarias) rmSync(pasta, { recursive: true, force: true });
});

function arquivoTemporario(_t?: unknown): string {
  const pasta = mkdtempSync(join(tmpdir(), "persistencia13-"));
  pastasTemporarias.push(pasta);
  return join(pasta, "agenda.sqlite");
}

async function enviar(app: ReturnType<typeof subir>["app"], conversaId: string, texto: string) {
  const r = await app.inject({ method: "POST", url: `/conversas/${conversaId}/mensagens`, payload: { texto } });
  return { status: r.statusCode, corpo: r.json() };
}

test("histórico recuperado após reiniciar entra na chamada ao modelo", async (t) => {
  const caminho = arquivoTemporario(t);

  const antes = subir(caminho);
  const conversaId = (await antes.app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  assert.equal((await enviar(antes.app, conversaId, "primeira")).status, 200);
  await antes.desligar();

  const depois = subir(caminho);
  t.after(() => depois.desligar());
  const r = await enviar(depois.app, conversaId, "segunda");
  assert.equal(r.status, 200, "a conversa existe depois do reinício");
  assert.deepEqual(
    historicoVisto.map((m) => [m.role, m.role === "system" ? "…" : m.content]),
    [["system", "…"], ["user", "primeira"], ["assistant", "ok: primeira"], ["user", "segunda"]],
  );
});

test("falha do modelo não grava a mensagem no histórico", async (t) => {
  const { app, banco, desligar } = subir(arquivoTemporario(t));
  t.after(desligar);
  const conversaId = (await app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  assert.equal((await enviar(app, conversaId, "falhar")).status, 500);
  assert.equal(
    (banco.prepare("SELECT COUNT(*) AS n FROM mensagens WHERE conversa_id = ?").get(conversaId) as { n: number }).n,
    1,
    "só a mensagem de sistema",
  );
});

test("conversa de outro usuário não é acessível", async (t) => {
  const caminho = arquivoTemporario(t);
  const doJoao = subir(caminho);
  const conversaId = (await doJoao.app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  await doJoao.desligar();

  const daMaria = subir(caminho, { usuario: "maria" });
  t.after(() => daMaria.desligar());
  const r = await enviar(daMaria.app, conversaId, "oi");
  assert.equal(r.status, 404);
  assert.equal(r.corpo.erro.codigo, "CONVERSA_NAO_ENCONTRADA");
});

test("proposta preparada sobrevive ao reinício, sem agendamento", async (t) => {
  const caminho = arquivoTemporario(t);
  const antes = subir(caminho);
  const conversaId = (await antes.app.inject({ method: "POST", url: "/conversas" })).json().conversaId;
  const { corpo } = await enviar(antes.app, conversaId, "agendar");
  const propostaId = corpo.propostas[0].propostaId;
  await antes.desligar();

  const depois = subir(caminho);
  t.after(() => depois.desligar());
  assert.deepEqual(buscarProposta(depois.banco, propostaId), {
    id: propostaId,
    conversaId,
    usuario: "joao",
    dados: { cliente: "joao", profissional: "ana", data: "2026-10-20", horario: "09:00" },
    chaveOperacao: `proposta-${propostaId}`,
  });
  assert.equal(contarAgendamentos(depois.banco), 0, "preparar não grava agendamento");
});
