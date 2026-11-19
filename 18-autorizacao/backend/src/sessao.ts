import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Banco } from "./banco.js";
import type { UsuarioAutenticado } from "./tipos.js";

// Sessão OPACA mantida no servidor.
// - O cookie leva só um token aleatório (32 bytes). Ele não contém
//   identidade: quem é o usuário está na tabela `sessoes`.
// - O banco guarda o SHA-256 do token, não o token: quem ler o banco não
//   consegue usar as sessões. (SHA-256 basta aqui porque o token já tem
//   256 bits aleatórios; senhas usam scrypt, em senha.ts.)
// - Cada sessão tem um token CSRF próprio, exigido nas escritas.
// - Expiração absoluta: depois de `expira_em`, a sessão é apagada e
//   recusada. Logout apaga a sessão na hora.

function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessaoCriada = { token: string; csrfToken: string; expiraEm: number };

export function criarSessao(banco: Banco, usuarioId: string, agora: number, duracaoMs: number): SessaoCriada {
  const sessao = {
    token: randomBytes(32).toString("base64url"),
    csrfToken: randomBytes(32).toString("base64url"),
    expiraEm: agora + duracaoMs,
  };
  banco
    .prepare("INSERT INTO sessoes (token_hash, usuario_id, csrf_token, expira_em) VALUES (?, ?, ?, ?)")
    .run(hashDoToken(sessao.token), usuarioId, sessao.csrfToken, sessao.expiraEm);
  return sessao;
}

export type SessaoValida = { usuario: UsuarioAutenticado; csrfToken: string };

/** Devolve a sessão se o token existir e não tiver expirado. */
export function validarSessao(banco: Banco, token: string, agora: number): SessaoValida | null {
  const linha = banco
    .prepare(
      `SELECT s.csrf_token, s.expira_em, u.id, u.login, u.nome
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = ?`,
    )
    .get(hashDoToken(token)) as Record<string, unknown> | undefined;
  if (!linha) return null;
  if (Number(linha.expira_em) <= agora) {
    encerrarSessao(banco, token);
    return null;
  }
  return {
    usuario: { id: String(linha.id), login: String(linha.login), nome: String(linha.nome) },
    csrfToken: String(linha.csrf_token),
  };
}

export function encerrarSessao(banco: Banco, token: string): void {
  banco.prepare("DELETE FROM sessoes WHERE token_hash = ?").run(hashDoToken(token));
}

/** Compara o token CSRF recebido com o da sessão, em tempo constante. */
export function csrfConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
