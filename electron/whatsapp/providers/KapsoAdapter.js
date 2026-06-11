const { IWhatsAppProvider } = require('../IWhatsAppProvider');
const { createLogger } = require('../../logger');

const KAPSO_BASE = 'https://api.kapso.ai/meta/whatsapp/v24.0';
const KAPSO_PLATFORM = 'https://api.kapso.ai/platform/v1';

// ── Kapso API trace logger (file: <userData>/logs/<user>/kapso-api.log + dev console) ──
let _apiLog = null;
function apiLogger() {
  if (!_apiLog) { try { _apiLog = createLogger({ file: 'kapso-api.log', scope: 'KAPSO_API' }); } catch {} }
  return _apiLog;
}
let _isDev = true;
try { _isDev = !require('electron').app?.isPackaged; } catch {}
function traceApi(method, url, status, ms, error) {
  const path = String(url).replace('https://api.kapso.ai', '').split('?')[0];
  const line = `${method} ${path} → ${status}${error ? ' ERR' : ''} (${ms}ms)`;
  if (_isDev) console.log('[kapso-api]', line + (error ? ` ${error}` : ''));
  try { apiLogger()?.info(line, { method, status, ms, error: error ? String(error).slice(0, 200) : undefined }); } catch {}
}
// fetch wrapper that traces method/url/status/duration (rethrows so callers handle errors)
async function tracedFetch(method, url, opts) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, opts);
    traceApi(method, url, res.status, Date.now() - t0);
    return res;
  } catch (err) {
    traceApi(method, url, 'ERR', Date.now() - t0, err.message);
    throw err;
  }
}

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
      const res = await tracedFetch('GET', `${KAPSO_PLATFORM}/whatsapp/messages?${params}`, {
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

  async getTemplates({ limit = 50, after } = {}) {
    if (!this._apiKey || !this._businessAccountId) return { ok: false, error: 'Business Account ID no configurado' };
    const params = new URLSearchParams({ limit: String(limit) });
    if (after) params.set('after', after);
    const res = await this._get(`/${this._businessAccountId}/message_templates?${params}`);
    if (!res.ok) return res;
    // Meta returns templates under `data` — normalize to `templates`.
    // Next-page cursor only valid when paging.next exists.
    const after_ = res.paging?.next ? res.paging?.cursors?.after : null;
    return { ok: true, templates: res.data ?? [], after: after_, businessAccountId: this._businessAccountId };
  }

  async createTemplate({ name, language = 'es_AR', category = 'MARKETING', body, variables = [], footer, headerText, headerExample, buttons = [] } = {}) {
    if (!this._apiKey || !this._businessAccountId) return { ok: false, error: 'No conectado o sin Business Account ID' };
    const components = [];

    if (headerText) {
      const header = { type: 'HEADER', format: 'TEXT', text: headerText };
      // Meta requires an example value when the header has a {{1}} variable
      if (/\{\{\d+\}\}/.test(headerText) && headerExample) header.example = { header_text: [headerExample] };
      components.push(header);
    }

    const bodyComponent = { type: 'BODY', text: body };
    if (variables.length) bodyComponent.example = { body_text: [variables] };
    components.push(bodyComponent);

    if (footer) components.push({ type: 'FOOTER', text: footer });

    // Buttons: QUICK_REPLY | URL | PHONE_NUMBER (max 3)
    const btns = (buttons || []).filter(b => b?.text?.trim()).slice(0, 3).map(b => {
      if (b.type === 'URL') {
        const out = { type: 'URL', text: b.text, url: b.url || '' };
        if (/\{\{\d+\}\}/.test(out.url) && b.example) out.example = [b.example];
        return out;
      }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: String(b.phone_number || '').replace(/[^0-9+]/g, '') };
      return { type: 'QUICK_REPLY', text: b.text };
    });
    if (btns.length) components.push({ type: 'BUTTONS', buttons: btns });

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
      const res = await tracedFetch('DELETE', url, {
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

  // ── Display name (Platform v1) ────────────────────────────────────────────

  /** Latest display-name change requests for this number (most recent first) */
  async getDisplayNameRequests() {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    try {
      const res = await tracedFetch('GET', `${KAPSO_PLATFORM}/whatsapp/phone_numbers/${this._phoneNumberId}/display_name_requests?per_page=5`, {
        headers: { 'X-API-Key': this._apiKey },
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const j = await res.json().catch(() => ({}));
      return { ok: true, requests: j?.data ?? [] };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  /** Submit a new display name to Meta for review (24-48h; some approve instantly) */
  async submitDisplayName(newName) {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    if (!newName?.trim()) return { ok: false, error: 'Nombre vacío' };
    try {
      const res = await tracedFetch('POST', `${KAPSO_PLATFORM}/whatsapp/phone_numbers/${this._phoneNumberId}/display_name_requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this._apiKey },
        body: JSON.stringify({ display_name_request: { new_display_name: newName.trim() } }),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const j = await res.json().catch(() => ({}));
      return { ok: true, request: j?.data ?? null };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  // ── Broadcasts (Platform v1, alpha) ───────────────────────────────────────

  /** Internal: Platform v1 fetch with X-API-Key. Returns { ok, data } or { ok:false, error } */
  async _platform(method, path, body) {
    if (!this._apiKey) return { ok: false, error: 'Not connected' };
    const url = `${KAPSO_PLATFORM}${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this._apiKey },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      traceApi(method, url, res.status, Date.now() - t0);
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const j = await res.json().catch(() => ({}));
      return { ok: true, data: j?.data ?? j };
    } catch (err) { traceApi(method, url, 'ERR', Date.now() - t0, err.message); return { ok: false, error: err.message }; }
  }

  /** Create a draft broadcast. templateId = Meta template id (numeric). */
  async createBroadcast({ name, templateId } = {}) {
    if (!this._phoneNumberId) return { ok: false, error: 'Sin número conectado' };
    return this._platform('POST', '/whatsapp/broadcasts', {
      whatsapp_broadcast: { name, phone_number_id: this._phoneNumberId, whatsapp_template_id: String(templateId) },
    });
  }

  /** Add recipients (≤1000/call). recipients: [{ phone_number, components }] */
  async addBroadcastRecipients(broadcastId, recipients) {
    return this._platform('POST', `/whatsapp/broadcasts/${broadcastId}/recipients`, {
      whatsapp_broadcast: { recipients },
    });
  }

  async sendBroadcast(broadcastId) {
    return this._platform('POST', `/whatsapp/broadcasts/${broadcastId}/send`);
  }

  /** scheduledAt = ISO-8601 with timezone, in the future */
  async scheduleBroadcast(broadcastId, scheduledAt) {
    return this._platform('POST', `/whatsapp/broadcasts/${broadcastId}/schedule`, { scheduled_at: scheduledAt });
  }

  async cancelBroadcast(broadcastId) {
    return this._platform('POST', `/whatsapp/broadcasts/${broadcastId}/cancel`);
  }

  async getBroadcast(broadcastId) {
    return this._platform('GET', `/whatsapp/broadcasts/${broadcastId}`);
  }

  /** List broadcasts for this number (most recent first) */
  async listBroadcasts({ perPage = 100 } = {}) {
    if (!this._phoneNumberId) return { ok: false, error: 'Sin número conectado' };
    const params = new URLSearchParams({ phone_number_id: this._phoneNumberId, per_page: String(perPage) });
    return this._platform('GET', `/whatsapp/broadcasts?${params}`);
  }

  /** Per-recipient delivery status for a broadcast */
  async listBroadcastRecipients(broadcastId, { perPage = 500, page = 1 } = {}) {
    const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
    return this._platform('GET', `/whatsapp/broadcasts/${broadcastId}/recipients?${params}`);
  }

  // ── Phone Number ──────────────────────────────────────────────────────────

  /** GET /platform/v1/whatsapp/phone_numbers/{id} — richer data than meta proxy */
  async getPhoneNumberDetails() {
    if (!this._apiKey || !this._phoneNumberId) return { ok: false, error: 'Not connected' };
    try {
      const res = await tracedFetch('GET', `${KAPSO_PLATFORM}/whatsapp/phone_numbers/${this._phoneNumberId}`, {
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
      const res = await tracedFetch('DELETE', url, {
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
      const res = await tracedFetch('GET', `${KAPSO_PLATFORM}/whatsapp/phone_numbers?per_page=50`, {
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

  /**
   * Create a hosted WhatsApp onboarding (setup) link using only the API key.
   * Lists the account's customer (1 per free account), creating one if none exists,
   * then generates a Meta embedded-signup setup link. Returns { ok, url }.
   */
  static async createOnboardingLink(apiKey, { language = 'es', theme } = {}) {
    if (!apiKey) return { ok: false, error: 'API Key requerida' };
    const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
    try {
      // 1. Find the customer (most recent first); create one if the account has none.
      let customerId = null;
      const listRes = await tracedFetch('GET', `${KAPSO_PLATFORM}/customers?per_page=1`, { headers });
      if (listRes.ok) {
        const j = await listRes.json().catch(() => ({}));
        customerId = j?.data?.[0]?.id ?? null;
      }
      if (!customerId) {
        const createRes = await tracedFetch('POST', `${KAPSO_PLATFORM}/customers`, {
          method: 'POST', headers,
          body: JSON.stringify({ customer: { name: 'Mi negocio' } }),
        });
        if (!createRes.ok) { const t = await createRes.text().catch(() => ''); return { ok: false, error: `Kapso ${createRes.status}: ${t}` }; }
        const cj = await createRes.json().catch(() => ({}));
        customerId = cj?.data?.id ?? null;
      }
      if (!customerId) return { ok: false, error: 'No se pudo obtener el customer de Kapso' };

      // 2. Create the setup link for that customer.
      const body = { setup_link: { language, ...(theme ? { theme_config: theme } : {}) } };
      const res = await tracedFetch('POST', `${KAPSO_PLATFORM}/customers/${customerId}/setup_links`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Kapso ${res.status}: ${t}` }; }
      const j = await res.json().catch(() => ({}));
      const url = j?.data?.url;
      if (!url) return { ok: false, error: 'Kapso no devolvió la URL del setup link' };
      return { ok: true, url, customerId, setupLinkId: j?.data?.id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  async _get(path) {
    const url = `${KAPSO_BASE}${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { 'X-API-Key': this._apiKey } });
      traceApi('GET', url, res.status, Date.now() - t0);
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, ...data };
    } catch (err) {
      traceApi('GET', url, 'ERR', Date.now() - t0, err.message);
      return { ok: false, error: err.message };
    }
  }

  async _post(path, payload) {
    const url = `${KAPSO_BASE}${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this._apiKey },
        body: JSON.stringify(payload),
      });
      traceApi('POST', url, res.status, Date.now() - t0);
      if (!res.ok) {
        const txt = await res.text().catch(() => String(res.status));
        return { ok: false, error: `Kapso ${res.status}: ${txt}` };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: true, ...data };
    } catch (err) {
      traceApi('POST', url, 'ERR', Date.now() - t0, err.message);
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { KapsoAdapter };
