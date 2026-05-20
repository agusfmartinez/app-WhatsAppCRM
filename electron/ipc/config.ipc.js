const { ipcMain } = require('electron')
const { loadConfig, saveConfig } = require('../services/configStorage')

function registerConfigIpc() {
  ipcMain.handle('config:load', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', async (_e, config) => {
    return saveConfig(config)
  })
}

module.exports = { registerConfigIpc }