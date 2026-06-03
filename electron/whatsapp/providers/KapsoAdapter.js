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

  /**
   * List messages via Platform v1 — always includes kapso.direction (inbound/outbound).
   * GET /platform/v1/whatsapp/messages?phone_number_id=X&conversation_id=UUID
   */
  async listMessages({ conversationId, limit = 60, after, before } = {}) {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    const params = new URLSearchParams({ phone_number_id: this._phoneNumberId, limit: String(limit) });
    if (conversationId) params.set('conversation_id', conversationId);
    if (after) params.set('after', after);
    if (before) params.set('before', before);
    try {
      const res = await fetch(`${KAPSO_PLATFORM}/whatsapp/messages?${params}`, {
        headers: { 'X-API-Key': this._apiKey },
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const data = await res.json().catch(() => ({}));
      return { ok: true, data: data?.data ?? [], paging: data?.paging };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  /**
   * List conversations via meta proxy with kapso enrichment.
   * GET /meta/whatsapp/v24.0/{phone_number_id}/conversations?fields=kapso()
   */
  async listConversations({ limit = 50, after, phone } = {}) {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    const params = new URLSearchParams({ fields: 'kapso()', limit: String(limit) });
    if (after) params.set('after', after);
    if (phone) params.set('phone_number', phone);
    return this._get(`/${this._phoneNumberId}/conversations?${params}`);
  }

  /** Get single conversation details */
  async getConversation(conversationId) {
    if (!this._apiKey) return { ok: false, error: 'Not connected' };
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

  /** GET /platform/v1/whatsapp/phone_numbers/{id} — richer data than meta proxy */
  async getPhoneNumberDetails() {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    try {
      const res = await fetch(`${KAPSO_PLATFORM}/whatsapp/phone_numbers/${this._phoneNumberId}`, {
        headers: { 'X-API-Key': this._apiKey },
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const json = await res.json().catch(() => ({}));
      // Platform v1 wraps the phone number under `data`
      return { ok: true, ...(json?.data ?? json) };
    } catch (err) { return { ok: false, error: err.message }; }
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

  /**
   * Fetch production phone numbers using only the API key.
   * Filters out sandbox numbers (kind === 'sandbox').
   * Returns: phone_number_id, business_account_id, display_phone_number, verified_name, status, kind
   */
  static async fetchPhoneNumbers(apiKey) {
    if (!apiKey) return { ok: false, error: 'API Key requerida' };
    try {
      const res = await fetch(`${KAPSO_PLATFORM}/whatsapp/phone_numbers?per_page=50`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      const all = data?.data ?? [];
      // Only production numbers — skip sandbox
      const production = all.filter(n => n.kind !== 'sandbox');
      return { ok: true, phoneNumbers: production };
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
