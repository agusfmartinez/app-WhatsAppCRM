const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let crashFile

function initCrashLogger() {
  const base = app.getPath('userData')
  const logsDir = path.join(base, 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)

  crashFile = path.join(logsDir, 'crashes.jsonl')
}

function writeCrash(data) {
  if (!crashFile) return

  const line = JSON.stringify(data) + '\n'
  fs.appendFileSync(crashFile, line)
}

module.exports = { initCrashLogger, writeCrash }