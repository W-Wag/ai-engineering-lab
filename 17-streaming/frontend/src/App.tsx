import { useEffect, useRef, useState } from "react";
import { Painel } from "./componentes.tsx";
import type { EstadoDaGeracao } from "./estado.ts";
import { transmitirGeracao } from "./cliente.ts";

// Exercício do módulo 17: as decisões de estado, acúmulo, cancelamento e
// identidade da execução ficam aqui. O transporte já está pronto em
// cliente.ts: transmitirGeracao(signal) entrega EventoDoCliente
// ("delta", "concluido", "erro", "cancelado", "falha_no_transporte").
//
// Você vai precisar de mais importações (useRef, useEffect,
// transmitirGeracao); acrescente-as quando chegar a hora.

// Ponto de injeção do transporte, só para a investigação: por padrão o App
// usa o cliente real; o cenário de execução anterior passa um simulado.
type PropsDoApp = { transmitir?: typeof transmitirGeracao };

export default function App({ transmitir = transmitirGeracao }: PropsDoApp) {
  // Os setters (setEstado, setTexto, setErro) ficam de fora até você usá-los:
  // com noUnusedLocals, um setter declarado e não usado quebra o typecheck.
  const [estado, setEstado] = useState<EstadoDaGeracao>("ocioso");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const idDaExecucao = useRef(0);
  const controladorAtivo = useRef<AbortController | null>(null);

  async function gerar() {
    // TODO 1: inicie uma execução nova, com identificador próprio, texto
    // limpo, sem erro e no estado "aguardando".

    idDaExecucao.current += 1;
    const minhaExecucao = idDaExecucao.current;

    setTexto("");
    setErro(null);
    setEstado("aguardando");

    // TODO 2: crie o AbortController desta execução e guarde-o onde
    // parar() consiga encontrá-lo.

    const controlador = new AbortController();
    controladorAtivo.current = controlador

    // TODO 3: percorra os eventos de transmitirGeracao(signal). Antes de
    // mexer em qualquer estado, confira se esta execução ainda é a ativa;
    // se não for, ignore o evento.

    for await (const evento of transmitir(controlador.signal)) {
      if (minhaExecucao !== idDaExecucao.current) return
  

    //   TODO 4: "delta" → acrescente o fragmento ao texto que já existe.
    //   TODO 4.1: o primeiro conteúdo muda "aguardando" para "recebendo".

    if (evento.tipo === "delta") {
      setTexto((anterior) => anterior + evento.texto)
      setEstado("recebendo")
    }

    //   TODO 5: "concluido" → estado "concluido", e somente nesse caso.

    if (evento.tipo === "concluido") {
      setEstado("concluido")
    }

    //   TODO 6: "cancelado" → estado "interrompido", mantendo o texto parcial.

    if (evento.tipo === "cancelado") {
      setEstado("interrompido")
    }

    //   TODO 7: "erro" ou "falha_no_transporte" → estado "erro", com
    //   mensagem, sem transformar o texto parcial em sucesso.
        if (evento.tipo === "erro") {
          setErro(`${evento.codigo}: ${evento.mensagem}`)
          setEstado("erro")
        }

        if (evento.tipo === "falha_no_transporte") {
          setErro(`${evento.motivo}: ${evento.detalhe}`)
          setEstado("erro")
        }
      }
    // TODO 8: ao terminar, limpe o controlador só se ele ainda for o desta
    // execução (a limpeza de uma execução antiga não pode apagar o de uma
    // nova).

    if (controlador === controladorAtivo.current) {
      controladorAtivo.current = null
    }
  }

  function parar() {
    // TODO 9: aborte o controlador da execução ativa.
    controladorAtivo.current?.abort()
  }

  // TODO 10: ao desmontar o componente, aborte a execução em andamento.

  // Apenas uma geração ativa por vez: "Gerar" fica indisponível e "Parar"
  // disponível enquanto a geração aguarda ou recebe.

  useEffect(() => {
    return () => {
      controladorAtivo.current?.abort()
    }
  }, [controladorAtivo])
  const ativa = estado === "aguardando" || estado === "recebendo";

  return (
    <Painel
      estado={estado}
      texto={texto}
      erro={erro}
      podeGerar={!ativa}
      podeParar={ativa}
      aoGerar={() => void gerar()}
      aoParar={parar}
    />
  );
}
