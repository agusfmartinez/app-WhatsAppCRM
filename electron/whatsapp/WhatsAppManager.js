const { KapsoAdapter } = require('./providers/KapsoAdapter');

const PROVIDERS = {
  kapso: KapsoAdapter,
  // waha: WahaAdapter,
  // baileys: BaileysAdapter,
};

function createWhatsAppManager(onEvent) {
  let provider = null;

  function _bindProvider(p) {
    provider = p;
    provider.on('status', (data) => onEvent({ type: 'status', ...data }));
    provider.on('qr', (data) => onEvent({ type: 'qr', ...data }));
    provider.on('message', (data) => onEvent({ type: 'message', ...data }));
    provider.on('error', (data) => onEvent({ type: 'error', ...data }));
  }

  function _delegate(method, ...args) {
    if (!provider) return Promise.resolve({ ok: false, error: 'No provider connected' });
    if (typeof provider[method] !== 'function') return Promise.resolve({ ok: false, error: `Provider no soporta ${method}` });
    return Promise.resolve(provider[method](...args));
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
      try { await provider.disconnect(); return { ok: true }; }
      catch (err) { return { ok: false, error: err.message }; }
    },

    getStatus() {
      if (!provider) return { status: 'disconnected' };
      return provider.getStatus();
    },

    listProviders: () => Object.keys(PROVIDERS),

    // Messages
    sendMessage: (to, body) => _delegate('sendMessage', to, body),
    sendTemplate: (to, name, lang, components) => _delegate('sendTemplate', to, name, lang, components),
    listMessages: (opts) => _delegate('listMessages', opts),

    // Conversations
    listConversations: (opts) => _delegate('listConversations', opts),
    getConversation: (id) => _delegate('getConversation', id),

    // Contacts (WA)
    listWaContacts: (opts) => _delegate('listWaContacts', opts),

    // Templates
    getTemplates: (opts) => _delegate('getTemplates', opts),
    createTemplate: (data) => _delegate('createTemplate', data),
    deleteTemplate: (name) => _delegate('deleteTemplate', name),

    // Business Profile
    getBusinessProfile: () => _delegate('getBusinessProfile'),
    updateBusinessProfile: (data) => _delegate('updateBusinessProfile', data),
    getDisplayNameRequests: () => _delegate('getDisplayNameRequests'),
    submitDisplayName: (name) => _delegate('submitDisplayName', name),

    // Broadcasts
    createBroadcast: (opts) => _delegate('createBroadcast', opts),
    addBroadcastRecipients: (id, recipients) => _delegate('addBroadcastRecipients', id, recipients),
    sendBroadcast: (id) => _delegate('sendBroadcast', id),
    scheduleBroadcast: (id, scheduledAt) => _delegate('scheduleBroadcast', id, scheduledAt),
    cancelBroadcast: (id) => _delegate('cancelBroadcast', id),
    getBroadcast: (id) => _delegate('getBroadcast', id),
    listBroadcasts: (opts) => _delegate('listBroadcasts', opts),
    listBroadcastRecipients: (id, opts) => _delegate('listBroadcastRecipients', id, opts),

    // Phone Number
    getPhoneNumberDetails: () => _delegate('getPhoneNumberDetails'),

    // Block Users
    listBlockedUsers: () => _delegate('listBlockedUsers'),
    blockUser: (phone) => _delegate('blockUser', phone),
    unblockUser: (phone) => _delegate('unblockUser', phone),
  };
}

module.exports = { createWhatsAppManager };
