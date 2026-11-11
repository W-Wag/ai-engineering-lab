import { imprimirContexto } from "./apresentacao.js";
import { montarContexto, selecionarRodadas } from "./contexto.js";
import {
  ESTADO_ATUAL,
  HISTORICO,
  INSTRUCOES,
  MENSAGEM_ATUAL,
  RESUMO_DESATUALIZADO,
} from "./dados.js";
import type { BlocoDeContexto, ContextoMontado } from "./tipos.js";

// Investigação: comparar a informação disponível em três variantes de
// contexto. Nenhuma chamada a modelo: só os blocos montados são inspecionados.
//
// Uso (na pasta do módulo): npm run investigar
//
// As três variantes usam as mesmas instruções, as mesmas rodadas recentes
// (N = 2) e a mesma mensagem atual. Muda só o que vem entre as instruções e
// as rodadas:
//   A: nada (sem estado, sem resumo)
//   B: o resumo desatualizado, como bloco "resumo" (sem estado)
//   C: o estado atual, como bloco "estado" (sem resumo)
//
// Não copie decisões para dentro das instruções: a investigação é justamente
// ver o que falta em cada variante.

const N = 2;

const antes = JSON.stringify(HISTORICO);

// TODO 3: monte a variante A (instruções → rodadas recentes → mensagem
// atual), com rodadasIncluidas e rodadasForaDoContexto.
// TODO 3.1: monte a variante B (instruções → resumo → rodadas recentes →
// mensagem atual).
// TODO 3.2: monte a variante C (instruções → estado → rodadas recentes →
// mensagem atual).
const variantes: { titulo: string; contexto: ContextoMontado }[] = [];

function montarVariante(blocoDoMeio: BlocoDeContexto | null) {
  const selecionadas = selecionarRodadas(HISTORICO, N);
  const blocos: BlocoDeContexto[] = [{ tipo: "instrucoes", texto: INSTRUCOES }];

  if (blocoDoMeio !== null) blocos.push(blocoDoMeio) 

  for (const rodada of selecionadas) {
    blocos.push({
      tipo: "mensagem",
      papel: "usuario",
      texto: rodada.usuario,
      rodada: rodada.numero,
    });
    blocos.push({
      tipo: "mensagem",
      papel: "assistente",
      texto: rodada.assistente,
      rodada: rodada.numero,
    });
  }

  blocos.push({
    tipo: "mensagem",
    papel: "usuario",
    texto: MENSAGEM_ATUAL,
    rodada: "atual",
  });

  const rodadasIncluidas = selecionadas.map(
    (selecionada) => selecionada.numero,
  );
  const rodadasForaDoContexto = HISTORICO
    .filter((item) => !rodadasIncluidas.includes(item.numero))
    .map((fora) => fora.numero);

  return { blocos, rodadasIncluidas, rodadasForaDoContexto };
}

const varianteA = montarVariante(null)
const varianteB = montarVariante({tipo: "resumo", texto: RESUMO_DESATUALIZADO})
const varianteC = montarVariante({tipo: "estado", dados: ESTADO_ATUAL})

variantes.push({titulo: "A -- Mensagens recentes", contexto: varianteA}, {titulo: "B -- Resumo desatualizado", contexto: varianteB}, {titulo: "C -- Estado Atual", contexto: varianteC})

for (const { titulo, contexto } of variantes) {
  imprimirContexto(contexto, N, titulo);
}


console.log(`Variantes montadas: ${variantes.length} de 3`);
const preservado = JSON.stringify(HISTORICO) === antes;
console.log(`Histórico original preservado: ${preservado ? "sim" : "NÃO"}`);
