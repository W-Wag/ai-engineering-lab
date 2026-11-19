import fastifyCookie from "@fastify/cookie";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { buscarUsuarioPorLogin, type Banco } from "./banco.js";
import { abrirConversa, criarConversa, listarConversasDe, responder } from "./conversas.js";
import type { ModeloSimulado } from "./modelo.js";
import { verificarSenha } from "./senha.js";
import { criarSessao, csrfConfere, encerrarSessao, validarSessao } from "./sessao.js";
import { ErroHttp, TodoPendente, type UsuarioAutenticado } from "./tipos.js";

// ---------- Contexto tipado da requisição ----------

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo backend a partir da sessão validada; null se não houver. */
    usuario: UsuarioAutenticado | null;
    /** Token CSRF da sessão atual (para conferir nas escritas). */
    csrfDaSessao: string | null;
  }
}

/** Identidade autenticada, ou 401. Use no início de toda rota protegida. */
export function exigirUsuario(request: FastifyRequest): UsuarioAutenticado {
  if (!request.usuario) throw new ErroHttp(401, "NAO_AUTENTICADO", "Faça login para continuar.");
  return request.usuario;
}

// ---------- Cookie de sessão ----------
//
// Configuração LOCAL (HTTP, http://localhost:5173 via proxy do Vite):
//   nome "sessao", HttpOnly, SameSite=Lax, Path=/, SEM Secure.
//   Sem Secure porque a conexão local não é HTTPS; fora de localhost, um
//   cookie sem Secure viajaria em texto puro.
//
// Configuração HTTPS (qualquer ambiente real):
//   Secure obrigatório (cookieSeguro: true) e, de preferência, o prefixo
//   "__Host-" no nome (exige Secure, Path=/ e nenhum Domain).
//
// HttpOnly impede que JavaScript da página leia o cookie (reduz o roubo da
// sessão por XSS, mas não impede um XSS de agir pela página).
//
// SameSite=Lax faz o navegador não enviar o cookie em requisições POST
// vindas de outro SITE. Não é proteção universal contra CSRF: "mesmo site"
// inclui outros subdomínios do mesmo domínio registrável, navegadores
// antigos ignoram o atributo e navegações GET de nível superior levam o
// cookie. Por isso as escritas exigem também o token CSRF da sessão
// (cabeçalho x-csrf-token) e requisições marcadas pelo navegador como
// cross-site (Sec-Fetch-Site) são recusadas.

export const NOME_DO_COOKIE = "sessao";
const UMA_HORA = 60 * 60 * 1000;

export type OpcoesDoApp = {
  banco: Banco;
  modelo: ModeloSimulado;
  /** Relógio injetável, para testar expiração. */
  agora?: () => number;
  duracaoDaSessaoMs?: number;
  /** true em HTTPS. Local (HTTP) fica false. */
  cookieSeguro?: boolean;
  fastify?: FastifyServerOptions;
};

const ESQUEMA_DE_ERRO = {
  type: "object",
  properties: {
    erro: {
      type: "object",
      properties: { codigo: { type: "string" }, mensagem: { type: "string" } },
    },
  },
} as const;

const PARAMETRO_ID = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", minLength: 1, maxLength: 100 } },
  additionalProperties: false,
} as const;

function textoObrigatorio(maximo: number) {
  return { type: "string", minLength: 1, maxLength: maximo, pattern: "\\S" } as const;
}

export function construirApp(opcoes: OpcoesDoApp): FastifyInstance {
  const { banco, modelo } = opcoes;
  const agora = opcoes.agora ?? Date.now;
  const duracao = opcoes.duracaoDaSessaoMs ?? 8 * UMA_HORA;

  const app = Fastify({
    ...opcoes.fastify,
    // Rejeitar campos extras em vez de removê-los em silêncio (o padrão do
    // Fastify é removeAdditional: true) e não converter tipos.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  app.register(fastifyCookie);
  app.decorateRequest("usuario", null);
  app.decorateRequest("csrfDaSessao", null);

  const opcoesDoCookie = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: opcoes.cookieSeguro ?? false,
    maxAge: Math.floor(duracao / 1000),
  };

  // 1. Escritas marcadas pelo navegador como vindas de outro site: recusar.
  // 2. Sessão: o cookie vira identidade só se a sessão existir e for válida.
  app.addHook("onRequest", async (request) => {
    const escrita = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (escrita && request.headers["sec-fetch-site"] === "cross-site") {
      throw new ErroHttp(403, "ORIGEM_RECUSADA", "Requisição de outro site recusada.");
    }
    const token = request.cookies[NOME_DO_COOKIE];
    if (!token) return;
    const sessao = validarSessao(banco, token, agora());
    if (sessao) {
      request.usuario = sessao.usuario;
      request.csrfDaSessao = sessao.csrfToken;
    }
  });

  /** Escrita autenticada: exige sessão (401) e token CSRF da sessão (403). */
  function exigirEscritaAutenticada(request: FastifyRequest): UsuarioAutenticado {
    const usuario = exigirUsuario(request);
    if (!csrfConfere(request.headers["x-csrf-token"], request.csrfDaSessao!)) {
      throw new ErroHttp(403, "CSRF_INVALIDO", "Token CSRF ausente ou inválido.");
    }
    return usuario;
  }

  // Erros: nunca devolver detalhes internos; nunca registrar corpo, senha ou
  // cookie (o logger do Fastify registra método e URL, não cabeçalhos).
  app.setErrorHandler((erro: FastifyError | ErroHttp | TodoPendente, request, reply: FastifyReply) => {
    if (erro instanceof ErroHttp) {
      return reply.code(erro.status).send({ erro: { codigo: erro.codigo, mensagem: erro.message } });
    }
    if (erro instanceof TodoPendente) {
      request.log.warn({ todo: erro.todo }, "rota bloqueada: TODO pendente");
      return reply.code(501).send({ erro: { codigo: "TODO_PENDENTE", mensagem: erro.message } });
    }
    if ("validation" in erro && erro.validation) {
      return reply.code(400).send({ erro: { codigo: "ENTRADA_INVALIDA", mensagem: erro.message } });
    }
    if ("statusCode" in erro && erro.statusCode && erro.statusCode < 500) {
      return reply.code(erro.statusCode).send({ erro: { codigo: "REQUISICAO_INVALIDA", mensagem: "Requisição inválida." } });
    }
    request.log.error({ err: erro }, "erro interno");
    return reply.code(500).send({ erro: { codigo: "ERRO_INTERNO", mensagem: "Erro interno." } });
  });

  // ---------- Sessão ----------

  app.post(
    "/sessao",
    {
      schema: {
        body: {
          type: "object",
          required: ["login", "senha"],
          properties: { login: textoObrigatorio(50), senha: textoObrigatorio(200) },
          additionalProperties: false,
        },
        response: { 401: ESQUEMA_DE_ERRO },
      },
    },
    async (request, reply) => {
      const { login, senha } = request.body as { login: string; senha: string };
      const encontrado = buscarUsuarioPorLogin(banco, login);
      // Mesmo tempo de verificação para login inexistente e senha errada.
      const senhaConfere = await verificarSenha(senha, encontrado?.senhaHash ?? HASH_FALSO);
      if (!encontrado || !senhaConfere) {
        request.log.info("login recusado");
        throw new ErroHttp(401, "CREDENCIAIS_INVALIDAS", "Login ou senha inválidos.");
      }
      // Nova sessão a cada login; a anterior deste navegador, se houver, acaba.
      const tokenAnterior = request.cookies[NOME_DO_COOKIE];
      if (tokenAnterior) encerrarSessao(banco, tokenAnterior);
      const sessao = criarSessao(banco, encontrado.usuario.id, agora(), duracao);
      reply.setCookie(NOME_DO_COOKIE, sessao.token, opcoesDoCookie);
      request.log.info({ usuarioId: encontrado.usuario.id }, "login aceito");
      return { usuario: encontrado.usuario, csrfToken: sessao.csrfToken };
    },
  );

  app.get("/sessao", async (request) => {
    const usuario = exigirUsuario(request);
    return { usuario, csrfToken: request.csrfDaSessao };
  });

  app.delete("/sessao", async (request, reply) => {
    exigirEscritaAutenticada(request);
    encerrarSessao(banco, request.cookies[NOME_DO_COOKIE]!);
    reply.clearCookie(NOME_DO_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  // ---------- Conversas (decisões de acesso em conversas.ts) ----------

  const naoEncontrada = () =>
    new ErroHttp(404, "CONVERSA_NAO_ENCONTRADA", "Conversa não encontrada.");

  app.get("/conversas", async (request) => {
    const usuario = exigirUsuario(request);
    return { conversas: listarConversasDe(banco, usuario) };
  });

  app.post(
    "/conversas",
    {
      schema: {
        body: {
          type: "object",
          required: ["titulo"],
          properties: { titulo: textoObrigatorio(120) },
          // userId, proprietarioId etc. são rejeitados aqui. Isso NÃO
          // substitui derivar o proprietário da sessão (TODO 3).
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const usuario = exigirEscritaAutenticada(request);
      const { titulo } = request.body as { titulo: string };
      const conversa = criarConversa(banco, usuario, titulo.trim());
      return reply.code(201).send({ conversa });
    },
  );

  app.get("/conversas/:id", { schema: { params: PARAMETRO_ID } }, async (request) => {
    const usuario = exigirUsuario(request);
    const { id } = request.params as { id: string };
    const resultado = abrirConversa(banco, usuario, id);
    if (!resultado) throw naoEncontrada();
    return resultado;
  });

  app.post(
    "/conversas/:id/mensagens",
    {
      schema: {
        params: PARAMETRO_ID,
        body: {
          type: "object",
          required: ["texto"],
          properties: { texto: textoObrigatorio(2000) },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const usuario = exigirEscritaAutenticada(request);
      const { id } = request.params as { id: string };
      const { texto } = request.body as { texto: string };
      const novas = responder(banco, modelo, usuario, id, texto.trim());
      if (!novas) throw naoEncontrada();
      return reply.code(201).send({ mensagens: novas });
    },
  );

  return app;
}

// Hash que nunca confere, com os mesmos parâmetros de scrypt: quando o
// login não existe, a verificação faz o mesmo trabalho e leva o mesmo tempo.
const HASH_FALSO = "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
