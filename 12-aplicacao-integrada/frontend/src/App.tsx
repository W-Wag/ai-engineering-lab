import { useEffect, useState } from "react";
import "./App.css";
import {
  AreaErro,
  FormularioMensagem,
  IndicadorCarregamento,
  ListaMensagens,
  type MensagemExibida,
} from "./componentes.tsx";
import { criarConversa, enviarMensagem } from "./api.ts";

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
      return
    }
    const novaMensagem: MensagemExibida = {id: crypto.randomUUID(), autor: "usuario", texto: texto.trim()}
    setMensagens(anteriores => [...anteriores, novaMensagem])
    setTexto("")
    setErro(undefined)
    setCarregando(true)

    const resultado = await enviarMensagem(conversaId, novaMensagem.texto)

    if (resultado.ok) {
      // TODO 7 (bloco 2): guarde resultado.dados.fontesConsultadas junto a
      // esta resposta do assistente, no campo fontesConsultadas da própria
      // mensagem. Não use uma lista global de fontes.
      const respostaDoAssistente: MensagemExibida = {id: crypto.randomUUID(), autor: "assistente", texto: resultado.dados.resposta, fontesConsultadas: resultado.dados.fontesConsultadas}
      setMensagens(anteriores => [...anteriores, respostaDoAssistente])
    } else {
      setErro(resultado.erro.mensagem)
    }


    setCarregando(false)

  };

  return (
    <main className="chat">
      <header className="chat__cabecalho">
        <h1>Assistente de agenda</h1>
        <p>Consulta de horários e políticas de atendimento. Dados fictícios.</p>
      </header>

      <ListaMensagens mensagens={mensagens} />
      <IndicadorCarregamento visivel={carregando} />
      <AreaErro mensagem={erro} />

      <FormularioMensagem
        texto={texto}
        // TODO 4: ligue o campo ao estado do texto.
        onTextoChange={setTexto}
        // TODO 4.1: ligue o formulário ao tratamento do TODO 3.
        onSubmit={(evento) => handleSubmit(evento)}
        // TODO 4.2: bloqueie botão e Enter enquanto carrega ou sem conversa.
        desabilitado={carregando||!conversaId}
      />
    </main>
  );
}
