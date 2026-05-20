// electron/logger.js
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let baseLogsDir

function initLogger() {
  const base = app.getPath('userData')
  baseLogsDir = path.join(base, 'logs')

  if (!fs.existsSync(baseLogsDir)) {
    fs.mkdirSync(baseLogsDir, { recursive: true })
  }
}

function getUserDir(userId = 'anonymous') {
  const dir = path.join(baseLogsDir, userId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function redactSecrets(msg) {
  return String(msg)
    .replace(/Bearer\s+[A-Za-z0-9\-._]+/g, 'Bearer [REDACTED]')
    .replace(/bp_token\s*=\s*[^\s]+/gi, 'bp_token=[REDACTED]')
    .replace(/bp_session_id\s*=\s*[^\s]+/gi, 'bp_session_id=[REDACTED]')
}

function formatLine(level, scope, message, meta = {}) {
  const env = app.isPackaged ? 'PROD' : 'DEV'
  const ts = new Date().toISOString()

  const safeMessage = redactSecrets(message)

  const metaStr = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')

  return `${ts} [${env}] [${level.toUpperCase()}] [${scope}] message=${JSON.stringify(safeMessage)}${metaStr ? ' ' + metaStr : ''}\n`
}

function write(filePath, line) {
  fs.appendFileSync(filePath, line)
}

// 🔹 NUEVO: logger por scope + archivo
function createLogger({ userId = 'anonymous', file = 'app.log', scope = 'APP' }) {
  return {
    info(message, meta) {
      const filePath = path.join(getUserDir(userId), file)
      write(filePath, formatLine('info', scope, message, meta))
    },
    warn(message, meta) {
      const filePath = path.join(getUserDir(userId), file)
      write(filePath, formatLine('warn', scope, message, meta))
    },
    error(message, meta) {
      const filePath = path.join(getUserDir(userId), file)
      write(filePath, formatLine('error', scope, message, meta))
    }
  }
}

// 🔹 mantener compatibilidad con lo viejo
function logToFile(level, origin, message) {
  const filePath = path.join(baseLogsDir, 'legacy.log')
  write(filePath, formatLine(level, origin, message))
}

module.exports = {
  initLogger,
  logToFile,
  createLogger
}