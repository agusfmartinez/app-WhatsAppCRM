const { EventEmitter } = require('events');

/**
 * Base class for all WhatsApp provider adapters.
 * Emit events: 'status', 'qr', 'message', 'error'
 *
 * status event payload: { status: 'connected'|'disconnected'|'connecting'|'qr' }
 * qr event payload:     { qr: string }
 * message event payload: { chatId, from, body, timestamp, id }
 */
class IWhatsAppProvider extends EventEmitter {
  /** @returns {Promise<void>} */
  async connect(_config) {
    throw new Error(`${this.constructor.name}.connect() not implemented`);
  }

  /** @returns {Promise<void>} */
  async disconnect() {
    throw new Error(`${this.constructor.name}.disconnect() not implemented`);
  }

  /**
   * @param {string} to  phone number e.g. "5491112345678"
   * @param {string} body  message text
   * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
   */
  async sendMessage(_to, _body) {
    throw new Error(`${this.constructor.name}.sendMessage() not implemented`);
  }

  /** @returns {{ status: string }} */
  getStatus() {
    throw new Error(`${this.constructor.name}.getStatus() not implemented`);
  }
}

module.exports = { IWhatsAppProvider };
