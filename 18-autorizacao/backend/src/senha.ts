import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Hash de senha com scrypt, do módulo node:crypto (nenhuma criptografia
// própria). Parâmetros: N = 2^17, r = 8, p = 1, o mínimo recomendado pelo
// OWASP Password Storage Cheat Sheet para scrypt. Cada hash leva um sal
// aleatório e guarda os próprios parâmetros, para que a verificação use os
// mesmos valores.
//
// Formato guardado: scrypt$N$r$p$sal(base64)$hash(base64)

const PARAMETROS = { N: 2 ** 17, r: 8, p: 1 };
const TAMANHO_DA_CHAVE = 64;

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  // maxmem precisa caber 128 * N * r bytes (128 MiB com os parâmetros acima).
  const maxmem = 128 * opcoes.N! * opcoes.r! + 32 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    scrypt(senha, sal, TAMANHO_DA_CHAVE, { ...opcoes, maxmem }, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return `scrypt$${N}$${r}$${p}$${sal.toString("base64")}$${chave.toString("base64")}`;
}

export async function verificarSenha(senha: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, N, r, p, sal, hash] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hash, "base64");
  const obtido = await derivar(senha, Buffer.from(sal, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  // Comparação em tempo constante.
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}
