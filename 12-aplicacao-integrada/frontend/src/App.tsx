import { useEffect, useState } from "react";
import "./App.css";
import type {EstadoDaConfirmacao,} from "./componentes.tsx"
import {
  AreaErro,
  FormularioMensagem,
  IndicadorCarregamento,
  ListaMensagens,
  type MensagemExibida,
} from "./componentes.tsx";
import { confirmarProposta, criarConversa, enviarMensagem } from "./api.ts";

// O backend guarda o histórico usado pelo modelo. Aqui ficam só as mensagens
// necessárias à apresentação.
//
// Cliente HTTP disponível em ./api.ts: criarConversa() e
// enviarMensagem(conversaId, texto). Os dois devolvem
// { ok: true, dados } ou { ok: false, erro: { codigo, mensagem, status? } }.
// Não reenvie automaticamente após uma falha: um erro de comunicação não
// prova que o backend deixou de processar o pedido.
//
// Cenário fictício: a data 20 de outubro de 2026 faz parte do cenário, não é
// a data corrente.

export default function App() {
  // TODO 1: crie a conversa ao abrir a página e guarde o conversaId.
  // TODO 1.1: o carregamento também cobre a criação da conversa; trate a
  // falha dessa criação na área de erro.

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const conversa = await criarConversa();
      if (conversa.ok === false) {
        setErro(conversa.erro.mensagem);
      } else {
        setConversaId(conversa.dados.conversaId);
      }

      setCarregando(false);
    })();
  }, []);

  // TODO 2: transforme os valores abaixo em estado: mensagens exibidas,
  // texto digitado, carregamento e erro.
  const [conversaId, setConversaId] = useState<string>("");
  const [mensagens, setMensagens] = useState<MensagemExibida[]>([]);
  const [texto, setTexto] = useState<string>("");
  const [carregando, setCarregando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | undefined>();
  const [estadoProposta, setEstadoProposta] =
    useState<Record<string, EstadoDaConfirmacao>>({});
  const [confirmacaoDesabilitada, setConfirmacaoDesabilitada] =
    useState<boolean>(false);

  // TODO 3: trate o envio do formulário (botão e Enter).
  // TODO 3.1: impeça envio vazio, sem conversa ou com envio em andamento.
  // TODO 3.2: adicione a mensagem do usuário à exibição.
  // TODO 3.3: chame enviarMensagem com a mesma conversa.
  // TODO 3.4: em sucesso, adicione a resposta do assistente.
  // TODO 3.5: em erro, apresente a mensagem de erro.
  // TODO 3.6: encerre o carregamento em sucesso ou erro.

  const handleSubmit = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();

    if (texto.trim().length === 0 || !conversaId || carregando === true) {
      return;
    }
    const novaMensagem: MensagemExibida = {
      id: crypto.randomUUID(),
      autor: "usuario",
      texto: texto.trim(),
    };
    setMensagens((anteriores) => [...anteriores, novaMensagem]);
    setTexto("");
    setErro(undefined);
    setCarregando(true);

    const resultado = await enviarMensagem(conversaId, novaMensagem.texto);

    if (resultado.ok) {
      // TODO 7 (bloco 2): guarde resultado.dados.fontesConsultadas junto a
      // esta resposta do assistente, no campo fontesConsultadas da própria
      // mensagem. Não use uma lista global de fontes.
      // TODO 9 (bloco 3): guarde também resultado.dados.propostas nesta
      // mesma mensagem, no campo propostas. Não guarde propostas fora da
      // mensagem a que pertencem.
      const respostaDoAssistente: MensagemExibida = {
        id: crypto.randomUUID(),
        autor: "assistente",
        texto: resultado.dados.resposta,
        fontesConsultadas: resultado.dados.fontesConsultadas,
        propostas: resultado.dados.propostas,
      };
      setMensagens((anteriores) => [...anteriores, respostaDoAssistente]);
    } else {
      setErro(resultado.erro.mensagem);
    }

    setCarregando(false);
  };

  // TODO 11 (bloco 3): crie a função que confirma uma proposta pelo
  // propostaId, chamando confirmarProposta(conversaId, propostaId) de ./api.ts.
  // O clique só inicia a tentativa; sucesso só depois da resposta do backend.
  // TODO 11.1: guarde o estado de cada proposta separadamente
  // (EstadoDaConfirmacao, de ./componentes.tsx) e marque "enviando" antes da
  // chamada. Ignore cliques numa proposta que já está enviando ou concluída.
  // TODO 11.2: em sucesso, guarde a confirmação devolvida pelo backend; o
  // card mostra criação ou reutilização a partir dela.
  // TODO 11.3: em falha, guarde a mensagem de erro, sem marcar sucesso.
  // TODO 11.4: depois de um erro, um novo clique tenta de novo com a mesma
  // proposta. Não reenvie automaticamente.
  // TODO 11.5: passe à ListaMensagens os estados, a função de confirmação e
  // o bloqueio externo (por exemplo, enquanto uma mensagem está sendo
  // enviada).

  const onConfirmarProposta = async (propostaId: string) => {
    const situacaoAtual = estadoProposta[propostaId]?.situacao
    if (situacaoAtual === "enviando" || situacaoAtual === "concluida") {
      return
    }
    
    setEstadoProposta((anteriores) => ({
      ...anteriores,
      [propostaId]: { situacao: "enviando" },
    }));
    setConfirmacaoDesabilitada(true);
    const confirmar = await confirmarProposta(conversaId, propostaId);

    if (confirmar.ok === false) {
      setEstadoProposta((anteriores) => ({
        ...anteriores,
        [propostaId]: {
          situacao: "erro",
          mensagem: confirmar.erro.mensagem,
        },
      }));
    } else {
      setEstadoProposta((anteriores) => ({
        ...anteriores,
        [propostaId]: {
          situacao: "concluida",
          confirmacao: confirmar.dados,
        },
      }));
    }

    setConfirmacaoDesabilitada(false);
  };

  return (
    <main className="chat">
      <header className="chat__cabecalho">
        <h1>Assistente de agenda</h1>
        <p>Horários, políticas e propostas de agendamento. Dados fictícios.</p>
      </header>

      <ListaMensagens
        mensagens={mensagens}
        confirmacaoDesabilitada={confirmacaoDesabilitada || carregando}
        estadosDasPropostas={estadoProposta}
        onConfirmarProposta={onConfirmarProposta}
      />
      <IndicadorCarregamento visivel={carregando} />
      <AreaErro mensagem={erro} />

      <FormularioMensagem
        texto={texto}
        // TODO 4: ligue o campo ao estado do texto.
        onTextoChange={setTexto}
        // TODO 4.1: ligue o formulário ao tratamento do TODO 3.
        onSubmit={(evento) => handleSubmit(evento)}
        // TODO 4.2: bloqueie botão e Enter enquanto carrega ou sem conversa.
        desabilitado={carregando || !conversaId}
      />
    </main>
  );
}
