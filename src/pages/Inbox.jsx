import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const POLL_INTERVAL = 30_000;       // conversation list
const ACTIVE_POLL_INTERVAL = 8_000; // open conversation — only while viewing it
const WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp customer-service window
const LAST_READ_KEY = 'inbox:lastRead';

/** True if the 24h free-reply window is open (last inbound within 24h) */
function isWindowOpen(lastInboundTs) {
  if (!lastInboundTs) return false;
  return Date.now() - new Date(lastInboundTs).getTime() < WINDOW_MS;
}

/** Date object from a message's unix-seconds timestamp */
function msgDate(msg) {
  return msg?.timestamp ? new Date(Number(msg.timestamp) * 1000) : null;
}

/** WhatsApp-style day label: Hoy / Ayer / "12 de mayo" / "12 de mayo de 2025" */
function dayLabel(d) {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yest.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function DateDivider({ label }) {
  return (
    <div className="flex justify-center my-2">
      <span className="text-[10px] text-gray-400 bg-gray-800/80 rounded-full px-3 py-1">{label}</span>
    </div>
  );
}

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

function ConversationItem({ conv, localContact, preview, unread, active, onClick }) {
  const displayName = localContact?.name || conv.contact_name || conv.phone_number || '—';
  const lastText = preview?.text || '';
  const lastTs = preview?.ts || conv.last_active_at;
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
            <span className={`text-sm truncate ${unread ? 'font-semibold text-white' : 'font-medium text-gray-100'}`}>{displayName}</span>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className={`text-[10px] ${unread ? 'text-green-400' : 'text-gray-500'}`}>{time}</span>
              {unread && <span className="h-2 w-2 rounded-full bg-green-500" />}
            </div>
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
  const [previews, setPreviews] = useState({}); // convId → { text, ts, lastInboundTs }
  const [convsCursor, setConvsCursor] = useState(null);
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const [lastRead, setLastRead] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_READ_KEY)) || {}; } catch { return {}; }
  });
  const [localContacts, setLocalContacts] = useState({}); // phone → contact
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsCursor, setMsgsCursor] = useState(null); // cursor for older messages
  const [loadingOlder, setLoadingOlder] = useState(false);
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
    const [convRes, msgRes] = await Promise.all([
      window.api?.whatsapp?.listConversations({ limit: 50 }),
      window.api?.whatsapp?.listMessages({ limit: 100 }), // recent across all convs, newest-first
    ]);

    // Build convId → preview from recent messages (newest-first).
    // First seen per conv = last message (any dir); first inbound seen = lastInboundTs.
    const map = {};
    for (const m of (msgRes?.ok && msgRes.data) || []) {
      const cid = m.kapso?.whatsapp_conversation_id;
      if (!cid) continue;
      const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null;
      if (!map[cid]) {
        map[cid] = { text: m.text?.body || m.kapso?.content || '', ts, lastInboundTs: null };
      }
      if (!map[cid].lastInboundTs && m.kapso?.direction === 'inbound') {
        map[cid].lastInboundTs = ts;
      }
    }
    setPreviews(map);

    if (convRes?.ok) {
      const convs = (convRes.data || []).slice().sort((a, b) => {
        const ta = new Date(map[a.id]?.ts || a.last_active_at || 0).getTime();
        const tb = new Date(map[b.id]?.ts || b.last_active_at || 0).getTime();
        return tb - ta;
      });
      setConversations(convs);
      setConvsCursor(convRes.paging?.next ? convRes.paging?.cursors?.after : null);
    }
    setLoadingConvs(false);
  }, []);

  // Load older conversations (next page). Previews stay as-is; older convs fall back
  // to last_active_at for ordering and show no message preview.
  const loadMoreConvs = useCallback(async () => {
    if (!convsCursor) return;
    setLoadingMoreConvs(true);
    const res = await window.api?.whatsapp?.listConversations({ limit: 50, after: convsCursor });
    if (res?.ok) {
      setConversations(prev => {
        const seen = new Set(prev.map(c => c.id));
        const merged = [...prev, ...(res.data || []).filter(c => !seen.has(c.id))];
        return merged;
      });
      setConvsCursor(res.paging?.next ? res.paging?.cursors?.after : null);
    }
    setLoadingMoreConvs(false);
  }, [convsCursor]);

  // silent=true (background poll) skips the loading state so the chat doesn't flicker
  const loadMessages = useCallback(async (conv, { silent = false } = {}) => {
    if (!conv) return;
    if (!silent) setLoadingMsgs(true);
    const res = await window.api?.whatsapp?.listMessages({ conversationId: conv.id, limit: 60 });
    if (res?.ok) {
      // Messages come newest-first; reverse for chat display (oldest→newest)
      setMessages([...(res.data || [])].reverse());
      setMsgsCursor(res.paging?.next ? res.paging?.cursors?.after : null);
    }
    if (!silent) setLoadingMsgs(false);
  }, []);

  // Load older messages (older page) and prepend to history
  const loadOlderMessages = useCallback(async () => {
    if (!active || !msgsCursor) return;
    setLoadingOlder(true);
    const res = await window.api?.whatsapp?.listMessages({ conversationId: active.id, limit: 60, after: msgsCursor });
    if (res?.ok) {
      const older = [...(res.data || [])].reverse(); // oldest→newest
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id));
        return [...older.filter(m => !seen.has(m.id)), ...prev];
      });
      setMsgsCursor(res.paging?.next ? res.paging?.cursors?.after : null);
    }
    setLoadingOlder(false);
  }, [active, msgsCursor]);

  // Initial load + polling (pauses when the window is hidden; the main-process
  // poller keeps watching for notifications)
  useEffect(() => {
    loadConversations();
    pollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [loadConversations]);

  // Refresh immediately when the background poller detects a new inbound message
  useEffect(() => {
    const off = window.api?.onNewMessage?.(() => {
      loadConversations();
      if (active) loadMessages(active, { silent: true });
    });
    return () => off?.();
  }, [loadConversations, loadMessages, active]);

  // Tell the main process which conversation is open (so it can skip notifying it)
  useEffect(() => {
    window.api?.setActiveConversation?.(active?.id || null);
    return () => window.api?.setActiveConversation?.(null);
  }, [active]);

  // Auto-select from Contacts (filterPhone) — one-shot on first nav
  useEffect(() => {
    if (autoSelectedRef.current || !state?.filterPhone || conversations.length === 0) return;
    const targetPhone = normPhone(state.filterPhone);
    const match = conversations.find(c => normPhone(c.phone_number) === targetPhone);
    if (match) { setActive(match); autoSelectedRef.current = true; }
  }, [conversations, state?.filterPhone]);

  // Open a conversation from a notification click — selects whenever the id changes
  useEffect(() => {
    if (!state?.openConversationId || conversations.length === 0) return;
    const match = conversations.find(c => c.id === state.openConversationId);
    if (match) setActive(match);
  }, [conversations, state?.openConversationId]);

  // Load messages when conversation changes + mark as read
  useEffect(() => {
    setMessages([]);
    loadMessages(active);
    if (active) {
      setLastRead(prev => {
        const next = { ...prev, [active.id]: new Date().toISOString() };
        try { localStorage.setItem(LAST_READ_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    }
  }, [active, loadMessages]);

  // Poll the open conversation fast (chat-like). Pauses when the window is hidden.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(active, { silent: true });
    }, ACTIVE_POLL_INTERVAL);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  // Auto-scroll only when the newest message changes or conversation switches —
  // not when prepending older messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages[messages.length - 1]?.id, active?.id]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active || !windowOpen) return;
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
      // Bump preview + reorder list
      setPreviews(prev => ({ ...prev, [active.id]: { text: content, ts: new Date().toISOString() } }));
      setConversations(prev => [active, ...prev.filter(c => c.id !== active.id)]);
    }
    setSending(false);
  };

  // 24h window for active conv: derive last inbound from loaded messages (authoritative),
  // fall back to global preview map.
  const activeLastInbound = (() => {
    if (!active) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].kapso?.direction === 'inbound' && messages[i].timestamp) {
        return new Date(Number(messages[i].timestamp) * 1000).toISOString();
      }
    }
    return previews[active.id]?.lastInboundTs || null;
  })();
  const windowOpen = active ? isWindowOpen(activeLastInbound) : false;

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const phone = normPhone(c.phone_number);
    const local = localContacts[phone];
    const name = local?.name || c.contact_name || '';
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
          ) : (
            <>
              {filtered.map(conv => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  preview={previews[conv.id]}
                  unread={(() => {
                    const inb = previews[conv.id]?.lastInboundTs;
                    if (!inb || active?.id === conv.id) return false;
                    const read = lastRead[conv.id];
                    return !read || new Date(inb).getTime() > new Date(read).getTime();
                  })()}
                  localContact={localContacts[normPhone(conv.phone_number)]}
                  active={active?.id === conv.id}
                  onClick={() => setActive(conv)}
                />
              ))}
              {convsCursor && !search && (
                <button onClick={loadMoreConvs} disabled={loadingMoreConvs}
                  className="w-full py-3 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors">
                  {loadingMoreConvs ? 'Cargando…' : 'Cargar más conversaciones'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat area */}
      {active ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-3">
            {(() => {
              const local = localContacts[normPhone(active.phone_number)];
              const name = local?.name || active.contact_name || active.phone_number;
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
            {!loadingMsgs && msgsCursor && (
              <div className="flex justify-center pb-2">
                <button onClick={loadOlderMessages} disabled={loadingOlder}
                  className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors">
                  {loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}
                </button>
              </div>
            )}
            {messages.map((msg, i) => {
              const d = msgDate(msg);
              const prevD = i > 0 ? msgDate(messages[i - 1]) : null;
              const showDivider = d && (!prevD || d.toDateString() !== prevD.toDateString());
              return (
                <div key={msg.id ?? i}>
                  {showDivider && <DateDivider label={dayLabel(d)} />}
                  <Message msg={msg} />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="px-4 py-3.5 border-t border-gray-800 flex items-center gap-3">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={!windowOpen}
              placeholder={windowOpen ? 'Escribí un mensaje...' : 'Ventana de 24hs cerrada'}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending || !windowOpen}
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
