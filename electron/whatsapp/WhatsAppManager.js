const { KapsoAdapter } = require('./providers/KapsoAdapter');

const PROVIDERS = {
  kapso: KapsoAdapter,
  // waha: WahaAdapter,
  // baileys: BaileysAdapter,
};

/**
 * Singleton manager. Holds the active provider instance.
 * onEvent(event) is called for every provider event → forwarded to renderer via IPC.
 */
function createWhatsAppManager(onEvent) {
  let provider = null;

  function _bindProvider(p) {
    provider = p;
    provider.on('status', (data) => onEvent({ type: 'status', ...data }));
    provider.on('qr', (data) => onEvent({ type: 'qr', ...data }));
    provider.on('message', (data) => onEvent({ type: 'message', ...data }));
    provider.on('error', (data) => onEvent({ type: 'error', ...data }));
  }

  return {
    async connect({ providerName = 'kapso', config = {} } = {}) {
      if (provider) await provider.disconnect().catch(() => {});
      const Adapter = PROVIDERS[providerName];
      if (!Adapter) return { ok: false, error: `Unknown provider: ${providerName}` };
      try {
        _bindProvider(new Adapter());
        await provider.connect(config);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async disconnect() {
      if (!provider) return { ok: true };
      try {
        await provider.disconnect();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async sendMessage(to, body) {
      if (!provider) return { ok: false, error: 'No provider connected' };
      return provider.sendMessage(to, body);
    },

    getStatus() {
      if (!provider) return { status: 'disconnected' };
      return provider.getStatus();
    },

    listProviders() {
      return Object.keys(PROVIDERS);
    },
  };
}

module.exports = { createWhatsAppManager };
