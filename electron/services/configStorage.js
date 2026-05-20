const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const CONFIG_FILE = 'config.json'

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE)
}

function loadConfig() {
  try {
    const p = getConfigPath()
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (e) {
    console.error('Error loading config', e)
    return null
  }
}

function saveConfig(config) {
  try {
    const p = getConfigPath()
    console.log(p)
    fs.writeFileSync(p, JSON.stringify(config, null, 2))
    return true
  } catch (e) {
    console.error('Error saving config', e)
    return false
  }
}

module.exports = { loadConfig, saveConfig }