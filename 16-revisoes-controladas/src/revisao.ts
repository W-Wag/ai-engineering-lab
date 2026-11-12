import {
  CAMPOS_REVISAVEIS,
  type Alteracoes,
  type Briefing,
  type CampoRevisavel,
  type ResultadoDaEstrutura,
  type ResultadoDaRevisao,
} from "./tipos.js";

/**
 * Validação estrutural da proposta recebida como `unknown`.
 *
 * Contrato:
 * - precisa ser um objeto não nulo e não array;
 * - precisa ter pelo menos uma propriedade;
 * - só propriedades de CAMPOS_REVISAVEIS são aceitas; qualquer outra
 *   (inclusive `versao` ou `camposPermitidos`) torna a proposta inválida,
 *   sem ser descartada em silêncio;
 * - cada valor precisa ser string não vazia depois de `trim()`; números não
 *   são convertidos e `null` não significa apagar;
 * - campo omitido significa preservar.
 * Devolve todos os motivos encontrados quando inválida.
 */
export function validarEstrutura(proposta: unknown): ResultadoDaEstrutura {
  // TODO 1: rejeite o que não for objeto não nulo e não array, e o objeto
  // sem nenhuma propriedade.
  // TODO 1.1: rejeite propriedades fora de CAMPOS_REVISAVEIS.
  // TODO 1.2: rejeite valores que não sejam string não vazia (após trim) e,
  // se nada foi rejeitado, devolva as alterações.

  if (
    typeof proposta !== "object" ||
    proposta === null ||
    Array.isArray(proposta)
  ) {
    return { valida: false, motivos: ["precisa ser um objeto"] };
  }

  const chaves = Object.keys(proposta);

  if (chaves.length === 0) {
    return { valida: false, motivos: ["nenhum campo enviado"] };
  }

  const motivos: string[] = [];

  const registro = proposta as Record<string, unknown>;
  const alteracoes: Alteracoes = {};

  for (const chave of chaves) {
    const campos = CAMPOS_REVISAVEIS as readonly string[];
    if (!campos.includes(chave)) {
      motivos.push(`propriedade desconhecida: ${chave}`);
      continue;
    }

    const valor = registro[chave];

    if (typeof valor !== "string" || valor.trim() === "") {
      motivos.push(`valor inválido em ${chave}: precisa ser texto não vazio`);
    } else {
      alteracoes[chave as CampoRevisavel] = valor.trim();
    }
  }

  if (motivos.length > 0) return { valida: false, motivos };

  return { valida: true, alteracoes };
}

/**
 * Validação de escopo: todas as alterações precisam estar na lista
 * `permitidos`, que vem da aplicação. Devolve os campos não permitidos
 * (lista vazia = dentro do escopo).
 */
export function camposForaDoEscopo(
  alteracoes: Alteracoes,
  permitidos: readonly CampoRevisavel[],
): CampoRevisavel[] {
  // TODO 2: devolva os campos de `alteracoes` que não estão em `permitidos`.
  const campos = Object.keys(alteracoes) as CampoRevisavel[];

  return campos.filter((campo) => !permitidos.includes(campo));
}

/**
 * Produz a nova versão: aplica as alterações, preserva os campos omitidos e
 * incrementa a versão. Não modifica `original`.
 */
export function aplicarAlteracoes(
  original: Briefing,
  alteracoes: Alteracoes,
): Briefing {
  // TODO 3: devolva um novo briefing com as alterações e a versão seguinte.
  const novoBriefing = {
    ...original,
    ...alteracoes,
    versao: original.versao + 1,
  };
  return novoBriefing;
}

/**
 * Fluxo completo: estrutura → escopo → aplicação. Nada é aplicado antes de
 * as duas validações terminarem; em falha, não existe revisão parcial.
 */
export function revisar(
  original: Briefing,
  proposta: unknown,
  permitidos: readonly CampoRevisavel[],
): ResultadoDaRevisao {
  // TODO 4: encadeie as três funções acima e devolva o ResultadoDaRevisao
  // correspondente a cada desfecho.
  const estrutura = validarEstrutura(proposta);

  if (!estrutura.valida)
    return { status: "estrutura_invalida", motivos: estrutura.motivos };

  const fora = camposForaDoEscopo(estrutura.alteracoes, permitidos);

  if (fora.length > 0)
    return { status: "fora_do_escopo", camposNaoPermitidos: fora };

  return {
    status: "revisao_aplicada",
    briefing: aplicarAlteracoes(original, estrutura.alteracoes),
  };
}
