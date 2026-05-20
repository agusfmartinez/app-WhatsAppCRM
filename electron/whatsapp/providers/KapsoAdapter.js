const { IWhatsAppProvider } = require('../IWhatsAppProvider');

class KapsoAdapter extends IWhatsAppProvider {
  constructor() {
    super();
    this._status = 'disconnected';
    this._config = null;
  }

  async connect(config) {
    this._config = config;
    this._status = 'connecting';
    this.emit('status', { status: 'connecting' });

    // TODO: implement Kapso API connection
    // Kapso uses a REST API + webhook for incoming messages.
    // 1. POST /session/start with apiKey → get session token
    // 2. Register webhook URL for incoming messages
    // 3. On success emit 'status' connected; on failure emit 'error'
    throw new Error('KapsoAdapter not yet implemented — configure your Kapso API key in Settings');
  }

  async disconnect() {
    // TODO: POST /session/stop
    this._status = 'disconnected';
    this.emit('status', { status: 'disconnected' });
  }

  async sendMessage(to, body) {
    if (this._status !== 'connected') {
      return { ok: false, error: 'Not connected' };
    }
    // TODO: POST /messages/send { to, body, apiKey }
    throw new Error('KapsoAdapter.sendMessage() not yet implemented');
  }

  getStatus() {
    return { status: this._status };
  }
}

module.exports = { KapsoAdapter };
