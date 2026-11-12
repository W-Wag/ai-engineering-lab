// Tipos e contratos do exercício. Nenhum SDK de IA é usado: a proposta é
// simulada e chega como `unknown`, como chegaria um JSON vindo de fora.

/** Briefing de uma versão. A versão é controlada pela aplicação. */
export type Briefing = {
  versao: number;
  mensagemPrincipal: string;
  publico: string;
  chamadaParaAcao: string;
};

/** Campos que uma proposta pode pedir para alterar. `versao` não está aqui. */
export const CAMPOS_REVISAVEIS = ["mensagemPrincipal", "publico", "chamadaParaAcao"] as const;
export type CampoRevisavel = (typeof CAMPOS_REVISAVEIS)[number];

/**
 * Alterações já validadas na estrutura: só campos revisáveis, cada um com
 * texto não vazio. Campo omitido = preservar o valor atual.
 */
export type Alteracoes = Partial<Record<CampoRevisavel, string>>;

/** Resultado da validação estrutural. */
export type ResultadoDaEstrutura =
  | { valida: true; alteracoes: Alteracoes }
  | { valida: false; motivos: string[] };

/**
 * Resultado da revisão. "revisao_aplicada" significa estrutura e escopo
 * aceitos, não conteúdo semanticamente correto.
 */
export type ResultadoDaRevisao =
  | { status: "estrutura_invalida"; motivos: string[] }
  | { status: "fora_do_escopo"; camposNaoPermitidos: CampoRevisavel[] }
  | { status: "revisao_aplicada"; briefing: Briefing };
