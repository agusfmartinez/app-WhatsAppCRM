const { contextBridge, ipcRenderer } = require('electron');

const waListeners = new Map();
const updaterListeners = new Map();

contextBridge.exposeInMainWorld('api', {
  // ── App info ──────────────────────────────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  forceUpdate: () => ipcRenderer.invoke('app:forceUpdate'),
  subscribeUpdaterLogs: () => ipcRenderer.invoke('updater:subscribe'),

  // ── WhatsApp events (push from main) ────────────────────────────────────
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

  // ── Updater logs (push from main) ────────────────────────────────────────
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

  // ── Contacts ──────────────────────────────────────────────────────────────
  contacts: {
    list: (filter) => ipcRenderer.invoke('crm:contacts:list', filter),
    get: (id) => ipcRenderer.invoke('crm:contacts:get', id),
    create: (data) => ipcRenderer.invoke('crm:contacts:create', data),
    update: (id, data) => ipcRenderer.invoke('crm:contacts:update', id, data),
    delete: (id) => ipcRenderer.invoke('crm:contacts:delete', id),
    stats: () => ipcRenderer.invoke('crm:contacts:stats'),
  },

  // ── Tags ─────────────────────────────────────────────────────────────────
  tags: {
    list: () => ipcRenderer.invoke('crm:tags:list'),
    create: (data) => ipcRenderer.invoke('crm:tags:create', data),
    update: (id, data) => ipcRenderer.invoke('crm:tags:update', id, data),
    delete: (id) => ipcRenderer.invoke('crm:tags:delete', id),
  },

  // ── Campaigns ─────────────────────────────────────────────────────────────
  campaigns: {
    list: () => ipcRenderer.invoke('crm:campaigns:list'),
    get: (id) => ipcRenderer.invoke('crm:campaigns:get', id),
    create: (data) => ipcRenderer.invoke('crm:campaigns:create', data),
    send: (id) => ipcRenderer.invoke('crm:campaigns:send', id),
    delete: (id) => ipcRenderer.invoke('crm:campaigns:delete', id),
  },

  // ── Conversations ─────────────────────────────────────────────────────────
  conversations: {
    list: () => ipcRenderer.invoke('crm:conversations:list'),
    get: (id) => ipcRenderer.invoke('crm:conversations:get', id),
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  messages: {
    list: (conversationId) => ipcRenderer.invoke('crm:messages:list', conversationId),
    send: (conversationId, content) => ipcRenderer.invoke('crm:messages:send', conversationId, content),
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: {
    get: (key) => ipcRenderer.invoke('crm:settings:get', key),
    set: (key, value) => ipcRenderer.invoke('crm:settings:set', key, value),
    getAll: () => ipcRenderer.invoke('crm:settings:get-all'),
  },

  // ── WhatsApp control ──────────────────────────────────────────────────────
  whatsapp: {
    getStatus: () => ipcRenderer.invoke('crm:whatsapp:status'),
    connect: (config) => ipcRenderer.invoke('crm:whatsapp:connect', config),
    disconnect: () => ipcRenderer.invoke('crm:whatsapp:disconnect'),
    listProviders: () => ipcRenderer.invoke('crm:whatsapp:providers'),
  },

  // ── Dashboard stats ───────────────────────────────────────────────────────
  stats: () => ipcRenderer.invoke('crm:stats'),
});

contextBridge.exposeInMainWorld('updater', {
  onUpdateEvent: (cb) => ipcRenderer.on('update:event', (_e, data) => cb(data)),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  forceCheck: () => ipcRenderer.invoke('update:force-check'),
  setChannel: (channel) => ipcRenderer.invoke('update:set-channel', channel),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
