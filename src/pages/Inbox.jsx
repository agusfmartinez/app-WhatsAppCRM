import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const POLL_INTERVAL = 30_000;

/** Normalize phone: digits only, strip leading zeros for display */
function normPhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function Avatar({ name, size = 9 }) {
  return (
    <div className={`h-${size} w-${size} rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-sm font-semibold text-gray-300`}>
      {String(name || '?')[0].toUpperCase()}
    </div>
  );
}

function ConversationItem({ conv, localContact, active, onClick }) {
  const displayName = localContact?.name || conv.kapso?.contact_name || conv.phone_number || '—';
  const lastText = conv.kapso?.last_message_text || '';
  const lastTs = conv.kapso?.last_message_timestamp || conv.last_active_at;
  const time = lastTs ? new Date(lastTs).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-gray-700/50 transition-colors ${active ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={displayName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-100 truncate">{displayName}</span>
            <span className="text-[10px] text-gray-500 shrink-0 ml-2">{time}</span>
          </div>
          {localContact?.tags?.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {localContact.tags.slice(0, 2).map(t => (
                <span key={t.id} className="rounded-full px-1.5 py-0 text-[10px]" style={{ backgroundColor: t.color + '22', color: t.color }}>{t.name}</span>
              ))}
            </div>
          )}
          {lastText && <p className="text-xs text-gray-500 truncate mt-0.5">{lastText}</p>}
        </div>
      </div>
    </button>
  );
}

function Message({ msg }) {
  const isOut = msg.kapso?.direction === 'outbound';
  const body = msg.text?.body || msg.kapso?.content || '';
  const ts = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm ${isOut ? 'bg-green-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'}`}>
        <p className="whitespace-pre-wrap">{body}</p>
        <p className={`text-[10px] mt-1 text-right ${isOut ? 'text-green-200' : 'text-gray-400'}`}>{ts}</p>
      </div>
    </div>
  );
}

export default function Inbox() {
  const { state } = useLocation();
  const [conversations, setConversations] = useState([]);
  const [localContacts, setLocalContacts] = useState({}); // phone → contact
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);
  const autoSelectedRef = useRef(false);

  // Load local contacts once for enrichment
  useEffect(() => {
    window.api?.contacts?.list({}).then(list => {
      const map = {};
      (list || []).forEach(c => { map[normPhone(c.phone)] = c; });
      setLocalContacts(map);
    }).catch(() => {});
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await window.api?.whatsapp?.listConversations({ limit: 50 });
    if (res?.ok) setConversations(res.data || []);
    setLoadingConvs(false);
  }, []);

  const loadMessages = useCallback(async (conv) => {
    if (!conv) return;
    setLoadingMsgs(true);
    const res = await window.api?.whatsapp?.listMessages({ conversationId: conv.id, limit: 60 });
    if (res?.ok) {
      // Messages come newest-first; reverse for chat display
      setMessages([...(res.data || [])].reverse());
    }
    setLoadingMsgs(false);
  }, []);

  // Initial load + polling
  useEffect(() => {
    loadConversations();
    pollRef.current = setInterval(loadConversations, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [loadConversations]);

  // Auto-select conversation when navigated from Contacts with filterPhone
  useEffect(() => {
    if (!state?.filterPhone || autoSelectedRef.current || conversations.length === 0) return;
    const targetPhone = normPhone(state.filterPhone);
    const match = conversations.find(c => normPhone(c.phone_number) === targetPhone);
    if (match) {
      setActive(match);
      autoSelectedRef.current = true;
    }
  }, [conversations, state?.filterPhone]);

  // Load messages when conversation changes
  useEffect(() => {
    setMessages([]);
    loadMessages(active);
  }, [active, loadMessages]);

  // Poll messages for active conversation
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadMessages(active), POLL_INTERVAL);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    setSending(true);
    const content = text.trim();
    const phone = active.phone_number;
    setText('');
    const res = await window.api?.whatsapp?.sendMessage(phone, content);
    if (res?.ok) {
      // Optimistic append
      setMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: content },
        kapso: { direction: 'outbound' },
      }]);
    }
    setSending(false);
  };

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const phone = normPhone(c.phone_number);
    const local = localContacts[phone];
    const name = local?.name || c.kapso?.contact_name || '';
    return name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
  });

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col">
        <div className="px-4 py-3.5 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white mb-2">Conversaciones</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <p className="text-xs text-gray-500 text-center py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">Sin conversaciones</p>
          ) : filtered.map(conv => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              localContact={localContacts[normPhone(conv.phone_number)]}
              active={active?.id === conv.id}
              onClick={() => setActive(conv)}
            />
          ))}
        </div>
      </div>

      {/* Chat area */}
      {active ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-3">
            {(() => {
              const local = localContacts[normPhone(active.phone_number)];
              const name = local?.name || active.kapso?.contact_name || active.phone_number;
              return (
                <>
                  <Avatar name={name} size={8} />
                  <div>
                    <div className="text-sm font-medium text-gray-100">{name}</div>
                    <div className="text-xs text-gray-500">{active.phone_number}</div>
                  </div>
                  {local?.tags?.length > 0 && (
                    <div className="ml-2 flex gap-1">
                      {local.tags.map(t => (
                        <span key={t.id} className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: t.color + '22', color: t.color }}>{t.name}</span>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {loadingMsgs && <p className="text-xs text-gray-500 text-center">Cargando mensajes...</p>}
            {!loadingMsgs && messages.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">Sin mensajes</p>
            )}
            {messages.map((msg, i) => <Message key={msg.id ?? i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="px-4 py-3.5 border-t border-gray-800 flex items-center gap-3">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Escribí un mensaje... (solo en ventana de 24hs)"
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
          <div className="text-center">
            <p className="text-sm text-gray-500">Seleccioná una conversación</p>
            <p className="text-xs text-gray-600 mt-1">Se actualiza cada 30 segundos</p>
          </div>
        </div>
      )}
    </div>
  );
}
