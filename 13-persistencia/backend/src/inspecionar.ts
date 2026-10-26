import { DatabaseSync } from "node:sqlite";

// Inspeção somente leitura do banco do módulo 13. Mostra agendamentos e
// operações, sem histórico de mensagens e sem nenhum dado sensível.
//
// Uso (na pasta backend):
//   CAMINHO_DO_BANCO=<arquivo> npm run inspecionar
//   CAMINHO_DO_BANCO=<arquivo> npm run inspecionar -- <propostaId>
//
// Com um propostaId, mostra também a proposta e a operação ligada à chave
// dela.

const caminho = process.env.CAMINHO_DO_BANCO;
if (!caminho) {
  console.error("Informe o arquivo do banco em CAMINHO_DO_BANCO.");
  process.exit(1);
}

const banco = new DatabaseSync(caminho, { readOnly: true });
const propostaId = process.argv[2];

const agendamentos = banco
  .prepare("SELECT id, cliente, profissional, data, horario, criado_em FROM agendamentos ORDER BY id")
  .all();
const operacoes = banco
  .prepare(
    "SELECT chave, profissional, data, horario, agendamento_id, concluida_em FROM operacoes ORDER BY concluida_em",
  )
  .all();

console.log(`Banco: ${caminho}`);
console.log(`Agendamentos: ${agendamentos.length}`);
console.table(agendamentos.map((linha) => ({ ...linha })));
console.log(`Operações concluídas: ${operacoes.length}`);
console.table(operacoes.map((linha) => ({ ...linha })));

if (propostaId) {
  const proposta = banco
    .prepare("SELECT id, conversa_id, profissional, data, horario, chave_operacao FROM propostas WHERE id = ?")
    .get(propostaId) as { chave_operacao: string } | undefined;

  if (proposta === undefined) {
    console.log(`Proposta ${propostaId}: não encontrada.`);
  } else {
    console.log("Proposta:");
    console.table([{ ...proposta }]);
    const operacao = banco
      .prepare("SELECT chave, agendamento_id, concluida_em FROM operacoes WHERE chave = ?")
      .get(proposta.chave_operacao);
    console.log(
      operacao === undefined
        ? "Operação desta proposta: nenhuma."
        : `Operação desta proposta: agendamento ${String((operacao as { agendamento_id: number }).agendamento_id)}.`,
    );
  }
}

banco.close();
