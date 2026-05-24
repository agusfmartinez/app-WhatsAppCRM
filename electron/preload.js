const { contextBridge, ipcRenderer } = require('electron');

const waListeners = new Map();
const updaterListeners = new Map();

contextBridge.exposeInMainWorld('api', {
  // ── App ───────────────────────────────────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  forceUpdate: () => ipcRenderer.invoke('app:forceUpdate'),
  subscribeUpdaterLogs: () => ipcRenderer.invoke('updater:subscribe'),

  // ── Push events from main ─────────────────────────────────────────────────
  onWhatsAppEvent: (cb) => {
    const wrapped = (_e, data) => cb(data);
    const existing = waListeners.get(cb);
    if (existing) ipcRenderer.removeListener('whatsapp:event', existing);
    waListeners.set(cb, wrapped);
    ipcRenderer.on('whatsapp:event', wrapped);
  },
  offWhatsAppEvent: (cb) => {
    const wrapped = waListeners.get(cb);
    if (wrapped) { ipcRenderer.removeListener('whatsapp:event', wrapped); waListeners.delete(cb); }
  },
  onUpdaterLog: (cb) => {
    const wrapped = (_e, data) => cb(data);
    const existing = updaterListeners.get(cb);
    if (existing) ipcRenderer.removeListener('updater:log', existing);
    updaterListeners.set(cb, wrapped);
    ipcRenderer.on('updater:log', wrapped);
  },
  offUpdaterLog: (cb) => {
    const wrapped = updaterListeners.get(cb);
    if (wrapped) { ipcRenderer.removeListener('updater:log', wrapped); updaterListeners.delete(cb); }
  },

  // ── CRM: Contacts (local DB) ──────────────────────────────────────────────
  contacts: {
    list: (filter) => ipcRenderer.invoke('crm:contacts:list', filter),
    get: (id) => ipcRenderer.invoke('crm:contacts:get', id),
    create: (data) => ipcRenderer.invoke('crm:contacts:create', data),
    update: (id, data) => ipcRenderer.invoke('crm:contacts:update', id, data),
    delete: (id) => ipcRenderer.invoke('crm:contacts:delete', id),
    stats: () => ipcRenderer.invoke('crm:contacts:stats'),
  },

  // ── CRM: Tags ─────────────────────────────────────────────────────────────
  tags: {
    list: () => ipcRenderer.invoke('crm:tags:list'),
    create: (data) => ipcRenderer.invoke('crm:tags:create', data),
    update: (id, data) => ipcRenderer.invoke('crm:tags:update', id, data),
    delete: (id) => ipcRenderer.invoke('crm:tags:delete', id),
  },

  // ── CRM: Campaigns ────────────────────────────────────────────────────────
  campaigns: {
    list: () => ipcRenderer.invoke('crm:campaigns:list'),
    get: (id) => ipcRenderer.invoke('crm:campaigns:get', id),
    create: (data) => ipcRenderer.invoke('crm:campaigns:create', data),
    send: (id) => ipcRenderer.invoke('crm:campaigns:send', id),
    delete: (id) => ipcRenderer.invoke('crm:campaigns:delete', id),
  },

  // ── CRM: Settings ─────────────────────────────────────────────────────────
  settings: {
    get: (key) => ipcRenderer.invoke('crm:settings:get', key),
    set: (key, value) => ipcRenderer.invoke('crm:settings:set', key, value),
    getAll: () => ipcRenderer.invoke('crm:settings:get-all'),
  },

  // ── CRM: Dashboard stats ──────────────────────────────────────────────────
  stats: () => ipcRenderer.invoke('crm:stats'),

  // ── CRM: Sync ─────────────────────────────────────────────────────────────
  syncKapsoContacts: () => ipcRenderer.invoke('crm:sync-kapso-contacts'),

  // ── WhatsApp: connection ──────────────────────────────────────────────────
  whatsapp: {
    getStatus: () => ipcRenderer.invoke('crm:whatsapp:status'),
    connect: (config) => ipcRenderer.invoke('crm:whatsapp:connect', config),
    disconnect: () => ipcRenderer.invoke('crm:whatsapp:disconnect'),
    listProviders: () => ipcRenderer.invoke('crm:whatsapp:providers'),
    detectNumbers: (apiKey) => ipcRenderer.invoke('crm:whatsapp:detect-numbers', apiKey),

    // Messages
    listMessages: (opts) => ipcRenderer.invoke('crm:whatsapp:list-messages', opts),
    sendMessage: (to, body) => ipcRenderer.invoke('crm:whatsapp:send-message', to, body),

    // Conversations
    listConversations: (opts) => ipcRenderer.invoke('crm:whatsapp:list-conversations', opts),
    getConversation: (id) => ipcRenderer.invoke('crm:whatsapp:get-conversation', id),

    // Templates
    getTemplates: () => ipcRenderer.invoke('crm:whatsapp:templates'),
    createTemplate: (data) => ipcRenderer.invoke('crm:whatsapp:create-template', data),
    deleteTemplate: (name) => ipcRenderer.invoke('crm:whatsapp:delete-template', name),

    // WA Contacts
    listWaContacts: (opts) => ipcRenderer.invoke('crm:whatsapp:wa-contacts', opts),

    // Business Profile
    getBusinessProfile: () => ipcRenderer.invoke('crm:whatsapp:business-profile'),
    updateBusinessProfile: (data) => ipcRenderer.invoke('crm:whatsapp:update-business-profile', data),

    // Phone Number
    getPhoneNumberDetails: () => ipcRenderer.invoke('crm:whatsapp:phone-details'),

    // Block Users
    listBlockedUsers: () => ipcRenderer.invoke('crm:whatsapp:blocked-users'),
    blockUser: (phone) => ipcRenderer.invoke('crm:whatsapp:block-user', phone),
    unblockUser: (phone) => ipcRenderer.invoke('crm:whatsapp:unblock-user', phone),
  },
});

contextBridge.exposeInMainWorld('updater', {
  onUpdateEvent: (cb) => ipcRenderer.on('update:event', (_e, data) => cb(data)),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  forceCheck: () => ipcRenderer.invoke('update:force-check'),
  setChannel: (channel) => ipcRenderer.invoke('update:set-channel', channel),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
