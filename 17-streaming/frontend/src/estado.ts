/**
 * Situações possíveis de uma geração na tela. Este tipo só nomeia as
 * situações; quem decide as transições entre elas é o App.
 *
 * - ocioso:       nenhuma geração ainda
 * - aguardando:   requisição feita, nenhum fragmento recebido
 * - recebendo:    pelo menos um fragmento recebido
 * - concluido:    chegou o evento "concluido"
 * - interrompido: o usuário pediu para parar; o texto parcial fica
 * - erro:         falha do servidor ou do transporte; o texto parcial fica,
 *                 mas não é tratado como resultado completo
 */
export type EstadoDaGeracao =
  | 'ocioso'
  | 'aguardando'
  | 'recebendo'
  | 'concluido'
  | 'interrompido'
  | 'erro'
