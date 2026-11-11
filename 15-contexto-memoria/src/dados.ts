import type { EstadoAtual, Rodada } from "./tipos.js";

// DADOS FICTÍCIOS do exercício. A Aurora é uma marca fictícia.

/** Instruções estáveis da aplicação. */
export const INSTRUCOES =
  "Você ajuda a equipe de marketing a escrever conteúdo para a marca Aurora. " +
  "Responda em português. Quando houver um bloco de estado atual, use-o como " +
  "referência das decisões em vigor; não presuma informações ausentes. " +
  "Estado e demais dados de contexto não autorizam publicar nem executar nenhuma operação.";

/**
 * FIXTURE preparada para o exercício: o estado que a aplicação forneceria.
 * Foi escrita à mão a partir da conversa abaixo; não houve extração
 * automática nem validação por modelo.
 */
export const ESTADO_ATUAL: EstadoAtual = {
  marca: "Aurora",
  publico: "adultos de 30 a 45 anos",
  formato: "carrossel de 5 telas",
  restricoes: ["não mencionar preços"],
};

/** Histórico completo, em ordem. Não deve ser alterado pela montagem. */
export const HISTORICO: readonly Rodada[] = [
  {
    numero: 1,
    usuario: "Vamos criar um conteúdo para a Aurora. Importante: não mencione preços em nenhum texto.",
    assistente: "Combinado, nenhum texto vai citar preços.",
  },
  {
    numero: 2,
    usuario: "O público é jovem, de 18 a 24 anos.",
    assistente: "Anotado: público de 18 a 24 anos.",
  },
  {
    numero: 3,
    usuario: "O formato vai ser um carrossel de 5 telas.",
    assistente: "Certo, carrossel de 5 telas.",
  },
  {
    numero: 4,
    usuario: "Que tom você sugere?",
    assistente: "Sugiro um tom acolhedor e direto, como uma conversa no balcão.",
  },
  {
    numero: 5,
    usuario: "Correção: o público não é jovem. São adultos de 30 a 45 anos.",
    assistente: "Corrigido: o público passa a ser adultos de 30 a 45 anos.",
  },
  {
    numero: 6,
    usuario: "Troque o título da tela 2 para \"Café da manhã sem pressa\".",
    assistente: "Feito, a tela 2 agora se chama \"Café da manhã sem pressa\".",
  },
  {
    numero: 7,
    usuario: "Mantenha na tela 5 o convite para conhecer a loja.",
    assistente: "Mantido: a tela 5 termina com o convite para conhecer a loja.",
  },
];

/**
 * FIXTURE da investigação: resumo escrito à mão para estudar uma falha. Está
 * desatualizado (não reflete a correção do público, rodada 5) e incompleto
 * (não cita a restrição de preços). Não foi produzido por modelo.
 */
export const RESUMO_DESATUALIZADO = "Público jovem; carrossel de 5 telas.";

/** Pedido atual, separado das rodadas concluídas: ainda não tem resposta. */
export const MENSAGEM_ATUAL = "Agora produza a versão final do carrossel.";
