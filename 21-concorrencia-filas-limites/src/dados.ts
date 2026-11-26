// DOCUMENTOS FICTÍCIOS da Aurora para popular a fila. Durações conhecidas
// para conferir a linha do tempo; doc-06 falha de propósito.

export const DOCUMENTOS = [
  { id: "doc-01", documento: "Briefing da campanha de inverno", duracaoMs: 400, deveFalhar: false },
  { id: "doc-02", documento: "Política de trocas", duracaoMs: 300, deveFalhar: false },
  { id: "doc-03", documento: "Roteiro do vídeo de lançamento", duracaoMs: 700, deveFalhar: false },
  { id: "doc-04", documento: "Tabela de preços da linha Aurora", duracaoMs: 350, deveFalhar: false },
  { id: "doc-05", documento: "Perguntas frequentes do atendimento", duracaoMs: 500, deveFalhar: false },
  { id: "doc-06", documento: "Contrato de fornecedor (arquivo corrompido)", duracaoMs: 250, deveFalhar: true },
  { id: "doc-07", documento: "Plano de mídia do trimestre", duracaoMs: 450, deveFalhar: false },
  { id: "doc-08", documento: "Manual da marca", duracaoMs: 600, deveFalhar: false },
  { id: "doc-09", documento: "Relatório de vendas de outubro", duracaoMs: 300, deveFalhar: false },
  { id: "doc-10", documento: "Calendário de posts", duracaoMs: 400, deveFalhar: false },
] as const;

/** Configuração usada pelo executor. */
export const CONFIGURACAO = {
  executor: "exec-A",
  maxConcorrencia: 3,
  intervaloMinimoMs: 150,
};
