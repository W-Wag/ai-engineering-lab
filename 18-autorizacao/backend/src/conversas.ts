import {
  inserirConversa,
  inserirMensagens,
  listarMensagens,
  paraConversa,
  type Banco,
} from "./banco.js";
import type { ModeloSimulado } from "./modelo.js";
import {
  TodoPendente,
  type Conversa,
  type Mensagem,
  type ResumoDeConversa,
  type UsuarioAutenticado,
} from "./tipos.js";

// EXERCÍCIO do módulo 18: as decisões de autorização ficam aqui.
//
// Contrato: cada conversa tem um proprietário, e só ele pode listá-la,
// abri-la e pedir uma resposta do modelo. `usuario` é sempre a identidade
// que o backend tirou da sessão validada; nada que venha da requisição
// (ID na URL, campos do corpo) diz quem é o usuário.
//
// Quando uma função devolve `null`, a rota responde 404, com a mesma
// resposta para "não existe" e "é de outro usuário".
//
// Disponível em banco.ts (nenhuma delas verifica acesso):
//   banco.prepare(sql).all(...valores) / .get(...valores)
//   paraConversa(linha), inserirConversa(banco, { titulo, proprietarioId }),
//   listarMensagens(banco, conversaId), inserirMensagens(banco, conversaId, mensagens)
// Tabela: conversas (id, proprietario_id, titulo, criada_em).
//
// Enquanto um TODO não estiver feito, a função lança TodoPendente e a rota
// responde 501, sem devolver dados, sem gravar e sem chamar o modelo.

/** GET /conversas */
export function listarConversasDe(
  banco: Banco,
  usuario: UsuarioAutenticado,
): ResumoDeConversa[] {
  // TODO 1: devolva só as conversas do usuário autenticado, mais recentes
  // primeiro, no formato ResumoDeConversa (id, titulo, criadaEm).
  const linhas = banco
    .prepare(
      "SELECT id, titulo, criada_em FROM conversas WHERE proprietario_id = ? ORDER BY criada_em DESC",
    )
    .all(usuario.id) as Record<string, unknown>[];
  return linhas.map((l) => ({
    id: String(l.id),
    titulo: String(l.titulo),
    criadaEm: String(l.criada_em),
  }));
}

/** A verificação de acesso do módulo: as outras funções devem usá-la. */
export function buscarConversaAcessivel(
  banco: Banco,
  usuario: UsuarioAutenticado,
  conversaId: string,
): Conversa | null {
  // TODO 2: busque a conversa considerando o ID E o usuário autenticado.
  // Devolva null quando ela não existir ou não for dele.
  const linha = banco
    .prepare("SELECT * FROM conversas WHERE id = ? AND proprietario_id = ?")
    .get(conversaId, usuario.id) as Record<string, unknown> | undefined;

  if (!linha) return null;
  return paraConversa(linha);
}

/** POST /conversas */
export function criarConversa(
  banco: Banco,
  usuario: UsuarioAutenticado,
  titulo: string,
): Conversa {
  // TODO 3: crie a conversa com o proprietário derivado da sessão.
  return inserirConversa(banco, { titulo, proprietarioId: usuario.id });
}

/** GET /conversas/:id */
export function abrirConversa(
  banco: Banco,
  usuario: UsuarioAutenticado,
  conversaId: string,
): { conversa: Conversa; mensagens: Mensagem[] } | null {
  // TODO 4: reutilize a verificação de acesso antes de carregar as
  // mensagens. Sem acesso, devolva null sem ler mensagem nenhuma.
  const conversa = buscarConversaAcessivel(banco, usuario, conversaId);

  if (!conversa) return null;
  return { conversa, mensagens: listarMensagens(banco, conversaId) };
}

/** POST /conversas/:id/mensagens: grava a mensagem do usuário e a resposta. */
export function responder(
  banco: Banco,
  modelo: ModeloSimulado,
  usuario: UsuarioAutenticado,
  conversaId: string,
  texto: string,
): Mensagem[] | null {
  // TODO 5: autorize ANTES de qualquer outra coisa. Sem acesso, devolva
  // null: sem carregar histórico, sem chamar o modelo, sem gravar.

  const conversa = buscarConversaAcessivel(banco, usuario, conversaId);
  if (!conversa) return null;
  // TODO 5.1: carregue o histórico, acrescente a mensagem nova e chame
  // modelo.responder com { papel, texto } de cada mensagem.
  const historico = listarMensagens(banco, conversaId);
  const agora = new Date().toISOString();
  const pergunta: Mensagem = { autor: "usuario", texto, criadaEm: agora };
  const paraOModelo = [...historico, pergunta].map((m) => ({
    papel: m.autor,
    texto: m.texto,
  }));
  const textoDaResposta = modelo.responder(paraOModelo);

  // TODO 5.2: grave a mensagem do usuário e a resposta, e devolva as duas.
  const resposta: Mensagem = {
    autor: "assistente",
    texto: textoDaResposta,
    criadaEm: new Date().toISOString(),
  };
  inserirMensagens(banco, conversa.id, [pergunta, resposta]);

  return [pergunta, resposta]
}
