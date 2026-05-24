const { IWhatsAppProvider } = require('../IWhatsAppProvider');

const KAPSO_BASE = 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_PLATFORM = 'https://api.kapso.ai/platform/v1';

class KapsoAdapter extends IWhatsAppProvider {
  constructor() {
    super();
    this._status = 'disconnected';
    this._apiKey = null;
    this._phoneNumberId = null;
    this._businessAccountId = null;
  }

  async connect({ apiKey, phoneNumberId, businessAccountId } = {}) {
    if (!apiKey || !phoneNumberId) {
      this.emit('error', { message: 'API Key y Phone Number ID son requeridos' });
      return;
    }
    this._apiKey = apiKey;
    this._phoneNumberId = phoneNumberId;
    this._businessAccountId = businessAccountId || null;
    this._status = 'connected';
    this.emit('status', { status: 'connected' });
  }

  async disconnect() {
    this._apiKey = null;
    this._phoneNumberId = null;
    this._businessAccountId = null;
    this._status = 'disconnected';
    this.emit('status', { status: 'disconnected' });
  }

  getStatus() {
    return { status: this._status };
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /** Send plain text (within 24h window only) */
  async sendMessage(to, body) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._post(`/${this._phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/[^0-9]/g, ''),
      type: 'text',
      text: { body },
    });
  }

  /** Send Meta-approved template (campaigns / cold outreach) */
  async sendTemplate(to, templateName, languageCode = 'es', components = []) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._post(`/${this._phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/[^0-9]/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    });
  }

  /** List messages for a phone number, optionally filtered by conversation */
  async listMessages({ conversationId, direction, limit = 50, after, before } = {}) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    const params = new URLSearchParams({ fields: 'kapso()', limit: String(limit) });
    if (conversationId) params.set('conversation_id', conversationId);
    if (direction) params.set('direction', direction);
    if (after) params.set('after', after);
    if (before) params.set('before', before);
    return this._get(`/${this._phoneNumberId}/messages?${params}`);
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  /** List conversations (most recent first) */
  async listConversations({ limit = 30, after, phone } = {}) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    const params = new URLSearchParams({ fields: 'kapso()', limit: String(limit) });
    if (after) params.set('after', after);
    if (phone) params.set('phone_number', phone);
    return this._get(`/${this._phoneNumberId}/conversations?${params}`);
  }

  /** Get single conversation details */
  async getConversation(conversationId) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._get(`/${this._phoneNumberId}/conversations/${conversationId}?fields=kapso()`);
  }

  // ── Contacts (WA) ─────────────────────────────────────────────────────────

  async listWaContacts({ limit = 50, after } = {}) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    const params = new URLSearchParams({ limit: String(limit) });
    if (after) params.set('after', after);
    return this._get(`/${this._phoneNumberId}/contacts?${params}`);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async getTemplates() {
    if (!this._apiKey || !this._businessAccountId) return { ok: false, error: 'Business Account ID no configurado' };
    const res = await this._get(`/${this._businessAccountId}/message_templates`);
    return res;
  }

  async createTemplate({ name, language = 'es_AR', category = 'MARKETING', body, variables = [], footer, headerText } = {}) {
    if (!this._apiKey || !this._businessAccountId) return { ok: false, error: 'No conectado o sin Business Account ID' };
    const components = [];
    if (headerText) components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    const bodyComponent = { type: 'BODY', text: body };
    if (variables.length) bodyComponent.example = { body_text: [variables] };
    components.push(bodyComponent);
    if (footer) components.push({ type: 'FOOTER', text: footer });
    return this._post(`/${this._businessAccountId}/message_templates`, {
      name: name.toLowerCase().replace(/\s+/g, '_'),
      language, category,
      parameter_format: 'POSITIONAL',
      components,
    });
  }

  async deleteTemplate(templateName) {
    if (!this._apiKey || !this._businessAccountId) return { ok: false, error: 'Business Account ID no configurado' };
    const url = `${KAPSO_BASE}/${this._businessAccountId}/message_templates?name=${encodeURIComponent(templateName)}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'X-API-Key': this._apiKey },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Business Profile ──────────────────────────────────────────────────────

  async getBusinessProfile() {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._get(`/${this._phoneNumberId}/whatsapp_business_profile`);
  }

  async updateBusinessProfile(data) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._post(`/${this._phoneNumberId}/whatsapp_business_profile`, data);
  }

  // ── Phone Number ──────────────────────────────────────────────────────────

  async getPhoneNumberDetails() {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._get(`/${this._phoneNumberId}`);
  }

  // ── Block Users ───────────────────────────────────────────────────────────

  async listBlockedUsers() {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._get(`/${this._phoneNumberId}/block_users`);
  }

  async blockUser(phone) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    return this._post(`/${this._phoneNumberId}/block_users`, {
      messaging_product: 'whatsapp',
      block_users: [{ phone: String(phone).replace(/[^0-9]/g, '') }],
    });
  }

  async unblockUser(phone) {
    if (this._status !== 'connected') return { ok: false, error: 'Not connected' };
    const url = `${KAPSO_BASE}/${this._phoneNumberId}/block_users`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this._apiKey },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          block_users: [{ phone: String(phone).replace(/[^0-9]/g, '') }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /** Fetch all phone numbers in the project using only the API key */
  static async fetchPhoneNumbers(apiKey) {
    if (!apiKey) return { ok: false, error: 'API Key requerida' };
    try {
      const res = await fetch(`${KAPSO_PLATFORM}/whatsapp/phone_numbers`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, phoneNumbers: data?.data ?? [] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  async _get(path) {
    try {
      const res = await fetch(`${KAPSO_BASE}${path}`, {
        headers: { 'X-API-Key': this._apiKey },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async _post(path, payload) {
    try {
      const res = await fetch(`${KAPSO_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this._apiKey },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { KapsoAdapter };
