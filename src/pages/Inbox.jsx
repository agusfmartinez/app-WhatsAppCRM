import { useEffect, useState, useRef } from 'react';

function ConversationItem({ conv, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-700/50 transition-colors ${active ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-300">
          {conv.contact_name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-100 truncate">{conv.contact_name}</span>
            {conv.last_message_at && (
              <span className="text-[10px] text-gray-500 shrink-0 ml-2">{conv.last_message_at?.slice(11, 16)}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">{conv.contact_phone}</div>
        </div>
      </div>
    </button>
  );
}

function Message({ msg }) {
  const isOut = msg.direction === 'out';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm ${isOut ? 'bg-green-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'}`}>
        <p>{msg.content}</p>
        <p className={`text-[10px] mt-1 ${isOut ? 'text-green-200' : 'text-gray-400'} text-right`}>
          {(msg.sent_at || msg.created_at)?.slice(11, 16)}
        </p>
      </div>
    </div>
  );
}

export default function Inbox() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    window.api?.conversations?.list().then(c => setConversations(c || [])).catch(() => {});

    const handler = (e) => {
      if (e.type === 'message') {
        window.api?.conversations?.list().then(c => setConversations(c || [])).catch(() => {});
        if (active && e.chatId) {
          setMessages(prev => [...prev, { ...e, direction: 'in', created_at: new Date().toISOString() }]);
        }
      }
    };
    window.api?.onWhatsAppEvent?.(handler);
    return () => window.api?.offWhatsAppEvent?.(handler);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.api?.messages?.list(active.id).then(m => setMessages(m || [])).catch(() => {});
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    setSending(true);
    const content = text.trim();
    setText('');
    const res = await window.api?.messages?.send(active.id, content);
    if (res?.ok) {
      setMessages(prev => [...prev, { id: res.id, content, direction: 'out', created_at: new Date().toISOString(), sent_at: new Date().toISOString() }]);
    }
    setSending(false);
  };

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Conversaciones</h2>
          <p className="text-xs text-gray-500 mt-0.5">{conversations.length} chats</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">Sin conversaciones</p>
          ) : (
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                active={active?.id === conv.id}
                onClick={() => setActive(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      {active ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-300">
              {active.contact_name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-100">{active.contact_name}</div>
              <div className="text-xs text-gray-500">{active.contact_phone}</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">Sin mensajes aún</p>
            )}
            {messages.map((msg, i) => <Message key={msg.id ?? i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="px-4 py-3.5 border-t border-gray-800 flex items-center gap-3">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Escribí un mensaje..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="h-10 w-10 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
            >
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Seleccioná una conversación</p>
        </div>
      )}
    </div>
  );
}
