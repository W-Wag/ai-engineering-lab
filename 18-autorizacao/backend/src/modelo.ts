// Modelo SIMULADO: resposta determinística, sem IA e sem rede.
//
// Ele só recebe a lista de mensagens e devolve um texto. Não recebe
// identidade, conversa nem banco: não escolhe em nome de quem age e não
// grava nada. Quem decide o que ele vê, e grava a resposta, é a aplicação.
//
// `observacao` existe para os testes conferirem quantas vezes o modelo foi
// chamado e o que recebeu. Fica só em memória e NÃO é exposta por rota.

export type MensagemParaModelo = { papel: "usuario" | "assistente"; texto: string };

export type ModeloSimulado = {
  responder(mensagens: readonly MensagemParaModelo[]): string;
  observacao: { chamadas: number; recebidas: MensagemParaModelo[][] };
};

export function criarModeloSimulado(): ModeloSimulado {
  const observacao = { chamadas: 0, recebidas: [] as MensagemParaModelo[][] };
  return {
    observacao,
    responder(mensagens) {
      observacao.chamadas++;
      observacao.recebidas.push(mensagens.map((m) => ({ ...m })));
      return `Resposta simulada: recebi ${mensagens.length} mensagem(ns) desta conversa.`;
    },
  };
}
