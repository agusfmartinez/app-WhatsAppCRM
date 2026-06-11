const { Notification } = require('electron');

/**
 * Local "near real-time" inbox: polls Kapso for recent messages and fires a native
 * notification when a new INBOUND message arrives. No server/webhook needed.
 * Polling does NOT consume the WhatsApp message quota (only API reads, which are free).
 *
 * @param {object} waManager  WhatsAppManager
 * @param {() => BrowserWindow|null} getWin
 * @param {object} logger
 * @returns {() => void} stop function
 */
function startInboxPoller(waManager, getWin, logger, getActiveConvId) {
  const POLL_MS = 20_000;
  let lastSeen = 0;      // newest inbound timestamp (unix seconds) we've already handled
  let primed = false;    // first tick only sets the baseline (no notifications for history)
  let inFlight = false;

  async function tick() {
    if (inFlight) return;
    if (waManager.getStatus?.().status !== 'connected') return;
    inFlight = true;
    try {
      const res = await waManager.listMessages({ limit: 30 });
      if (!res?.ok) return;
      const msgs = res.data || [];
      const ts = (m) => Number(m?.timestamp) || 0;

      if (!primed) {
        lastSeen = msgs.reduce((mx, m) => Math.max(mx, ts(m)), 0);
        primed = true;
        console.log(`[inbox-poller] primed: lastSeen=${lastSeen}, ${msgs.length} msgs, Notification.isSupported=${Notification.isSupported()}`);
        return;
      }

      const fresh = msgs
        .filter(m => m.kapso?.direction === 'inbound' && ts(m) > lastSeen)
        .sort((a, b) => ts(a) - ts(b)); // oldest → newest

      if (!fresh.length) return;
      lastSeen = Math.max(lastSeen, ...fresh.map(ts));
      console.log(`[inbox-poller] ${fresh.length} inbound nuevo(s) → notificando (isSupported=${Notification.isSupported()})`);

      const win = getWin();
      // "Visible" (shown, not minimized) is enough — the chat may be on a second
      // monitor without focus, but the user still sees the message there.
      const visible = !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
      const activeId = getActiveConvId?.() || null;
      if (Notification.isSupported()) {
        for (const m of fresh.slice(-5)) { // cap notifications per tick
          const conversationId = m.kapso?.whatsapp_conversation_id || null;
          // Skip if this conversation is open and on screen
          if (visible && conversationId && conversationId === activeId) continue;
          const title = m.kapso?.contact_name || m.from || 'WhatsApp';
          const body = m.text?.body || m.kapso?.content || 'Nuevo mensaje';
          const n = new Notification({ title, body });
          n.on('click', () => {
            const w = getWin();
            if (!w) return;
            if (w.isMinimized()) w.restore();
            w.show(); w.focus();
            w.webContents.send('inbox:open-conversation', { conversationId });
          });
          n.show();
        }
      }
      if (win && !win.isDestroyed()) win.webContents.send('whatsapp:new-message', { count: fresh.length });
    } catch (err) {
      logger?.error?.(`Inbox poller error: ${err.message}`);
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(tick, POLL_MS);
  tick();
  return () => clearInterval(timer);
}

module.exports = { startInboxPoller };
