const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const { initLogger, createLogger } = require("./logger");
const { initCrashLogger, writeCrash } = require('./crashLogger');
const { initDb, closeDb } = require('./db/database');
const { initCrm } = require('./ipc/crm.ipc');
const { createWhatsAppManager } = require('./whatsapp/WhatsAppManager');
const { autoUpdater } = require("electron-updater");

let win;
let splash;
let appLogger;
let ipcLogger;
let securityLogger;
let rendererLogger;
let devLoadRetries = 0;
const MAX_DEV_RETRIES = 20;
const DEV_RETRY_DELAY_MS = 500;
let updateRetryTimer;
let updaterLogBuffer = [];
const UPDATER_LOG_BUFFER_LIMIT = 50;
let updateRetryCount = 0;
const UPDATE_MAX_RETRIES = 3;
let updateLastCheck = 0;
const UPDATE_MIN_INTERVAL_MS = 5000;
const UPDATE_RETRY_DELAY_MS = 10000;
let updateDownloadTimeout = null;
let updateBackgroundTimer = null;
let updateSuppressedUntil = 0;
const UPDATE_SUPPRESS_MS = 1000 * 60 * 30;
let currentUpdateChannel = null;

process.env.APP_PACKAGED = app.isPackaged ? "true" : "false";

function logWith(logger, fallbackScope, level, message, meta) {
  if (logger && typeof logger[level] === 'function') {
    return logger[level](message, meta);
  }
  const line = `[${fallbackScope}] ${message}`;
  if (level === 'error') return console.error(line);
  if (level === 'warning' || level === 'warn') return console.warn(line);
  return console.log(line);
}

function logMain(level, msg, meta) { return logWith(appLogger, "MAIN", level, msg, meta); }
function logIpc(level, msg, meta) { return logWith(ipcLogger, "IPC", level, msg, meta); }
function logSecurity(level, msg, meta) { return logWith(securityLogger, "SECURITY", level, msg, meta); }
function logRenderer(level, msg, meta) { return logWith(rendererLogger, "RENDERER", level, msg, meta); }

process.on("uncaughtException", (err) => {
  writeCrash({ timestamp: new Date().toISOString(), type: "uncaughtException", message: err.message, stack: err.stack, appVersion: app.getVersion(), os: process.platform });
  logMain("error", err.stack || err.message);
});

process.on("unhandledRejection", (reason) => {
  writeCrash({ timestamp: new Date().toISOString(), type: "unhandledRejection", message: String(reason), stack: reason?.stack || null, appVersion: app.getVersion(), os: process.platform });
  logMain("error", String(reason));
});

function createSplash() {
  splash = new BrowserWindow({ width: 420, height: 280, frame: false, transparent: true, alwaysOnTop: true, resizable: false, show: true });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function webContentLogs(w) {
  w.webContents.on('did-finish-load', () => logMain('info', `Renderer loaded: ${w.webContents.getURL()}`));
  w.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logMain('error', `Renderer load failed ${code} ${desc} url=${url}`);
    if (!app.isPackaged && url?.startsWith('http://localhost:5173') && code === -102 && devLoadRetries < MAX_DEV_RETRIES) {
      devLoadRetries++;
      setTimeout(() => w.loadURL('http://localhost:5173'), DEV_RETRY_DELAY_MS);
    }
  });
  w.webContents.on('render-process-gone', (_e, details) => logMain('error', `Renderer crash: reason=${details.reason}`));
  w.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) logRenderer('info', `console level=${level} ${sourceId}:${line} ${message}`);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "../assets/icon.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  webContentLogs(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    logSecurity('warning', `Blocked window.open to: ${url}`);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || (!app.isPackaged && url.startsWith('http://localhost:5173'));
    if (!allowed) { event.preventDefault(); logSecurity('warning', `Blocked navigate to: ${url}`); }
  });

  if (!app.isPackaged || process.env.ELECTRON_DEV === "true") {
    win.loadURL("http://localhost:5173");
  } else {
    win.webContents.on("before-input-event", (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === "i") event.preventDefault();
    });
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ─── Auto-update ──────────────────────────────────────────────────────────────

function safeCheckForUpdates({ force = false } = {}) {
  if (!currentUpdateChannel) return;
  const now = Date.now();
  if (!force && updateSuppressedUntil && now < updateSuppressedUntil) return;
  if (now - updateLastCheck < UPDATE_MIN_INTERVAL_MS) return;
  updateLastCheck = now;
  autoUpdater.channel = currentUpdateChannel;
  autoUpdater.allowPrerelease = currentUpdateChannel === 'beta';
  autoUpdater.checkForUpdates().catch((err) => logMain("error", `checkForUpdates failed: ${err?.message || err}`));
}

function initAutoUpdate() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const sendUpdateEvent = (payload) => {
    try { if (win && !win.isDestroyed()) win.webContents.send('update:event', payload); } catch {}
  };

  const emitUpdaterLog = (level, message, meta) => {
    const entry = { level, message, meta, ts: Date.now() };
    updaterLogBuffer.push(entry);
    if (updaterLogBuffer.length > UPDATER_LOG_BUFFER_LIMIT) updaterLogBuffer = updaterLogBuffer.slice(-UPDATER_LOG_BUFFER_LIMIT);
    try { if (win && !win.isDestroyed()) win.webContents.send('updater:log', entry); } catch {}
    if (level === 'error') console.error(message, meta || '');
    else if (level === 'warn') console.warn(message, meta || '');
    else console.log(message, meta || '');
  };

  autoUpdater.on("checking-for-update", () => { sendUpdateEvent({ status: "checking" }); emitUpdaterLog("info", "Checking for updates..."); });
  autoUpdater.on("update-available", () => { updateRetryCount = 0; sendUpdateEvent({ status: "available" }); emitUpdaterLog("info", "Update available"); });
  autoUpdater.on("update-not-available", () => { updateRetryCount = 0; sendUpdateEvent({ status: "idle" }); emitUpdaterLog("info", "App is up to date"); });

  autoUpdater.on("error", (err) => {
    const message = String(err?.message || err);
    sendUpdateEvent({ status: "error", message });
    emitUpdaterLog("error", "AutoUpdater error", { error: message });
    if (updateRetryCount < UPDATE_MAX_RETRIES) {
      updateRetryCount++;
      const retryIn = UPDATE_RETRY_DELAY_MS * updateRetryCount;
      emitUpdaterLog("warn", `Retrying update (#${updateRetryCount}) in ${retryIn / 1000}s`);
      setTimeout(() => safeCheckForUpdates(), retryIn);
    } else {
      updateSuppressedUntil = Date.now() + UPDATE_SUPPRESS_MS;
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateEvent({ status: "downloading", percent: Math.round(progress.percent) });
    if (updateDownloadTimeout) clearTimeout(updateDownloadTimeout);
    updateDownloadTimeout = setTimeout(() => {
      emitUpdaterLog("warn", "Download stalled, retrying...");
      try { autoUpdater.cancelDownload(); } catch {}
      safeCheckForUpdates();
    }, 30000);
  });

  autoUpdater.on("update-downloaded", () => {
    if (updateDownloadTimeout) { clearTimeout(updateDownloadTimeout); updateDownloadTimeout = null; }
    sendUpdateEvent({ status: "downloaded" });
    emitUpdaterLog("info", "Update ready to install");
  });

  if (!updateBackgroundTimer) {
    updateBackgroundTimer = setInterval(() => safeCheckForUpdates(), 1000 * 60 * 30);
  }
}

function setUpdateChannel(channel) {
  const normalized = channel === 'beta' ? 'beta' : 'latest';
  currentUpdateChannel = normalized;
  autoUpdater.channel = normalized;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = normalized === 'beta';
  return normalized;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle("updater:subscribe", async () => {
  try {
    if (win && !win.isDestroyed()) {
      updaterLogBuffer.forEach((entry) => {
        try { win.webContents.send('updater:log', entry); } catch {}
      });
    }
  } catch {}
  return { ok: true, count: updaterLogBuffer.length };
});

ipcMain.handle("update:check", async () => {
  try { autoUpdater.autoDownload = false; safeCheckForUpdates(); return { ok: true }; }
  catch (err) { logMain("error", `Update check failed: ${err?.message}`); return { ok: false, error: String(err?.message) }; }
});

ipcMain.handle("update:set-channel", async (_e, channel) => {
  try { return { ok: true, channel: setUpdateChannel(channel) }; }
  catch (err) { return { ok: false, error: String(err?.message) }; }
});

ipcMain.handle("update:install", async () => {
  try { autoUpdater.quitAndInstall(); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err?.message) }; }
});

ipcMain.handle("update:force-check", async () => {
  try { updateRetryCount = 0; updateSuppressedUntil = 0; autoUpdater.autoDownload = true; return await autoUpdater.checkForUpdates(); }
  catch (err) { return { ok: false, error: String(err?.message) }; }
});

ipcMain.handle("update:download", async () => {
  try { autoUpdater.autoDownload = true; await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err?.message) }; }
});

ipcMain.handle('app:info', () => {
  const platform = process.platform;
  const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'MacOS' : 'Linux';
  return { appVersion: app.getVersion(), deviceName: os.hostname(), os: osName };
});

ipcMain.handle('app:forceUpdate', () => { return { ok: true }; });

ipcMain.handle('app:open-external', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'URL inválida' };
  await shell.openExternal(url);
  return { ok: true };
});

// ─── Auto-connect WhatsApp from saved settings ────────────────────────────────

function tryAutoConnect(waManager, logger) {
  try {
    const { getDb } = require('./db/database');
    const db = getDb();

    const getSetting = (key) => {
      const stmt = db.prepare('SELECT value FROM settings WHERE key=?');
      stmt.bind([key]);
      let val = null;
      if (stmt.step()) val = stmt.getAsObject().value;
      stmt.free();
      if (!val) return null;
      try { return JSON.parse(val); } catch { return val; }
    };

    const providerName = getSetting('wa_provider') || 'kapso';
    const apiKey = getSetting('wa_api_key');
    const phoneNumberId = getSetting('wa_api_url');           // stored as wa_api_url
    const businessAccountId = getSetting('wa_business_account_id');

    if (!apiKey || !phoneNumberId) {
      logger?.info('Auto-connect: no credentials saved, skipping');
      return;
    }

    waManager.connect({ providerName, config: { apiKey, phoneNumberId, businessAccountId } })
      .then(res => logger?.info(`Auto-connect ${providerName}: ${res.ok ? 'connected' : res.error}`))
      .catch(err => logger?.error(`Auto-connect error: ${err.message}`));
  } catch (err) {
    logger?.error(`Auto-connect setup failed: ${err.message}`);
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  initLogger();
  initCrashLogger();
  appLogger = createLogger({ userId: '', file: 'app.log', scope: 'MAIN' });
  ipcLogger = createLogger({ userId: '', file: 'app.log', scope: 'IPC' });
  securityLogger = createLogger({ userId: '', file: 'app.log', scope: 'SECURITY' });
  rendererLogger = createLogger({ userId: '', file: 'app.log', scope: 'RENDERER' });
  appLogger.info("WA CRM Desktop started");

  try {
    await initDb();
    appLogger.info("SQLite DB initialized");
  } catch (err) {
    appLogger.error(`DB init failed: ${err.message}`);
  }

  // Register IPC handlers BEFORE creating the window to avoid race conditions
  // (renderer can call IPC immediately after load, before createWindow returns)
  const waManager = createWhatsAppManager((event) => {
    try {
      if (win && !win.isDestroyed()) win.webContents.send('whatsapp:event', event);
    } catch {}
  });

  initCrm(ipcMain, waManager);
  logIpc('info', 'CRM IPC registered');

  // Auto-connect WhatsApp using saved settings
  tryAutoConnect(waManager, appLogger);

  createSplash();
  createWindow();
  initAutoUpdate();

  win.once('ready-to-show', () => {
    if (splash) splash.close();
    win.show();
  });
});

app.on('will-quit', () => {
  closeDb();
});
