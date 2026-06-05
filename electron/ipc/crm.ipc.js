const { getDb, saveDb } = require('../db/database');

// ─── sql.js helpers ───────────────────────────────────────────────────────────

function all(sql, params = []) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function first(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] ?? null;
}

function run(sql, params = []) {
  const db = getDb();
  db.run(sql, params.length ? params : undefined);
  const lastId = db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] ?? null;
  saveDb();
  return { lastInsertRowid: lastId };
}

// Run without immediate save — use inside batch operations
function runBatch(sql, params = []) {
  const db = getDb();
  db.run(sql, params.length ? params : undefined);
  return db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0] ?? null;
}

function initCrm(ipcMain, waManager) {
  // ─── Contacts ─────────────────────────────────────────────────────────────

  ipcMain.handle('crm:contacts:list', (_e, { search = '', tagId = null, limit = null, offset = 0 } = {}) => {
    let sql = `
      SELECT c.id, c.name, c.phone, c.email, c.company, c.notes, c.kapso_id, c.wa_name, c.created_at, c.updated_at,
             GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) AS tags_raw
      FROM contacts c
      LEFT JOIN contact_tags ct ON ct.contact_id = c.id
      LEFT JOIN tags t ON t.id = ct.tag_id
    `;
    const params = [];
    const where = [];
    if (search) {
      where.push(`(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.company LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (tagId) {
      where.push(`c.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ?)`);
      params.push(tagId);
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` GROUP BY c.id ORDER BY c.name ASC`;
    // Pagination is opt-in: callers that need all contacts (Campaigns target, Inbox
    // enrichment) omit `limit`; the Contacts page passes limit/offset.
    if (limit != null) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }
    const rows = all(sql, params).map(parseTags);
    return rows;
  });

  ipcMain.handle('crm:contacts:get', (_e, id) => {
    const row = first(`
      SELECT c.id, c.name, c.phone, c.email, c.company, c.notes, c.kapso_id, c.wa_name, c.created_at, c.updated_at,
             GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) AS tags_raw
      FROM contacts c
      LEFT JOIN contact_tags ct ON ct.contact_id = c.id
      LEFT JOIN tags t ON t.id = ct.tag_id
      WHERE c.id = ?
      GROUP BY c.id
    `, [id]);
    return row ? parseTags(row) : null;
  });

  ipcMain.handle('crm:contacts:create', (_e, data) => {
    const { name, email = null, company = null, notes = null, tagIds = [] } = data;
    const phone = normalizePhone(data.phone);
    const { lastInsertRowid: id } = run(
      `INSERT INTO contacts (name, phone, email, company, notes) VALUES (?, ?, ?, ?, ?)`,
      [name, phone, email, company, notes]
    );
    tagIds.forEach(tid => runBatch(
      `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, [id, tid]
    ));
    if (tagIds.length) saveDb();
    return { ok: true, id };
  });

  ipcMain.handle('crm:contacts:update', (_e, id, data) => {
    const { name, phone, email, company, notes, tagIds } = data;
    run(
      `UPDATE contacts SET name=?, phone=?, email=?, company=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      [name, phone, email ?? null, company ?? null, notes ?? null, id]
    );
    if (Array.isArray(tagIds)) {
      runBatch(`DELETE FROM contact_tags WHERE contact_id = ?`, [id]);
      tagIds.forEach(tid => runBatch(
        `INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, [id, tid]
      ));
      saveDb();
    }
    return { ok: true };
  });

  ipcMain.handle('crm:contacts:delete', (_e, id) => {
    run(`DELETE FROM contacts WHERE id = ?`, [id]);
    return { ok: true };
  });

  ipcMain.handle('crm:contacts:stats', () => {
    const row = first(`SELECT COUNT(*) AS total FROM contacts`);
    return { total: row?.total ?? 0 };
  });

  // ─── Tags ─────────────────────────────────────────────────────────────────

  ipcMain.handle('crm:tags:list', () => all(`SELECT * FROM tags ORDER BY name ASC`));

  ipcMain.handle('crm:tags:create', (_e, { name, color = '#6b7280' }) => {
    const { lastInsertRowid: id } = run(`INSERT INTO tags (name, color) VALUES (?, ?)`, [name, color]);
    return { ok: true, id };
  });

  ipcMain.handle('crm:tags:update', (_e, id, { name, color }) => {
    run(`UPDATE tags SET name=?, color=? WHERE id=?`, [name, color, id]);
    return { ok: true };
  });

  ipcMain.handle('crm:tags:delete', (_e, id) => {
    run(`DELETE FROM tags WHERE id = ?`, [id]);
    return { ok: true };
  });

  // ─── Campaigns ────────────────────────────────────────────────────────────

  ipcMain.handle('crm:campaigns:list', () =>
    all(`SELECT * FROM campaigns ORDER BY created_at DESC`)
  );

  ipcMain.handle('crm:campaigns:get', (_e, id) => {
    const campaign = first(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign) return null;
    const contacts = all(`
      SELECT cc.id, cc.status, cc.sent_at, cc.error, c.name, c.phone
      FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
      WHERE cc.campaign_id = ?
    `, [id]);
    return { ...campaign, contacts };
  });

  ipcMain.handle('crm:campaigns:create', (_e, { name, templateName, templateLanguage = 'es', templateVariables = [], contactIds = [] }) => {
    const variablesJson = JSON.stringify(templateVariables);
    const { lastInsertRowid: campaignId } = run(
      `INSERT INTO campaigns (name, message_template, template_name, template_language, template_variables, total_contacts) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, templateName, templateName, templateLanguage, variablesJson, contactIds.length]
    );
    contactIds.forEach(cid => runBatch(
      `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES (?, ?)`, [campaignId, cid]
    ));
    if (contactIds.length) saveDb();
    return { ok: true, id: campaignId };
  });

  ipcMain.handle('crm:campaigns:delete', (_e, id) => {
    run(`DELETE FROM campaigns WHERE id = ?`, [id]);
    return { ok: true };
  });

  ipcMain.handle('crm:campaigns:send', async (_e, id) => {
    const campaign = first(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign) return { ok: false, error: 'Campaign not found' };
    if (campaign.status === 'sent') return { ok: false, error: 'Already sent' };

    const contacts = all(`
      SELECT cc.id AS cc_id, c.phone
      FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
      WHERE cc.campaign_id = ? AND cc.status = 'pending'
    `, [id]);

    runBatch(`UPDATE campaigns SET status='sending' WHERE id=?`, [id]);
    saveDb();

    // Delay between messages — read from settings (default 1000ms)
    const delayRow = first(`SELECT value FROM settings WHERE key='campaign_delay'`);
    const delayMs = Math.max(0, Number(delayRow?.value) || 1000);

    const templateName = campaign.template_name || campaign.message_template;
    const templateLanguage = campaign.template_language || 'es';

    // Build body components from stored variables
    let variables = [];
    try { variables = JSON.parse(campaign.template_variables || '[]'); } catch {}
    const components = variables.length
      ? [{ type: 'body', parameters: variables.map(v => ({ type: 'text', text: String(v) })) }]
      : [];

    let sent = 0;
    let errors = 0;
    for (let i = 0; i < contacts.length; i++) {
      const row = contacts[i];
      try {
        const res = await waManager.sendTemplate(row.phone, templateName, templateLanguage, components);
        if (res.ok) {
          runBatch(`UPDATE campaign_contacts SET status='sent', sent_at=datetime('now') WHERE id=?`, [row.cc_id]);
          sent++;
        } else {
          runBatch(`UPDATE campaign_contacts SET status='error', error=? WHERE id=?`, [res.error ?? 'Error desconocido', row.cc_id]);
          errors++;
        }
      } catch (err) {
        runBatch(`UPDATE campaign_contacts SET status='error', error=? WHERE id=?`, [err.message, row.cc_id]);
        errors++;
      }
      // Delay between messages (skip after last one)
      if (delayMs > 0 && i < contacts.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    runBatch(`UPDATE campaigns SET status='sent', sent_at=datetime('now'), sent_count=?, error_count=? WHERE id=?`, [sent, errors, id]);
    saveDb();

    return { ok: true, sent, errors };
  });

  // ─── Settings ─────────────────────────────────────────────────────────────

  ipcMain.handle('crm:settings:get', (_e, key) => {
    const row = first(`SELECT value FROM settings WHERE key = ?`, [key]);
    return row ? tryParseJson(row.value) : null;
  });

  ipcMain.handle('crm:settings:set', (_e, key, value) => {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, serialized]);
    return { ok: true };
  });

  ipcMain.handle('crm:settings:get-all', () => {
    const rows = all(`SELECT key, value FROM settings`);
    return Object.fromEntries(rows.map(r => [r.key, tryParseJson(r.value)]));
  });

  // ─── WhatsApp ─────────────────────────────────────────────────────────────

  // ── WhatsApp: connection ──────────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:status', () => waManager.getStatus());
  ipcMain.handle('crm:whatsapp:connect', async (_e, config) => waManager.connect(config));
  ipcMain.handle('crm:whatsapp:disconnect', async () => waManager.disconnect());
  ipcMain.handle('crm:whatsapp:providers', () => waManager.listProviders());
  ipcMain.handle('crm:whatsapp:detect-numbers', async (_e, apiKey) => {
    const { KapsoAdapter } = require('../whatsapp/providers/KapsoAdapter');
    return KapsoAdapter.fetchPhoneNumbers(apiKey);
  });
  ipcMain.handle('crm:whatsapp:create-setup-link', async (_e, apiKey, opts) => {
    const { KapsoAdapter } = require('../whatsapp/providers/KapsoAdapter');
    return KapsoAdapter.createOnboardingLink(apiKey, opts);
  });

  // ── WhatsApp: messages ────────────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:list-messages', async (_e, opts) => waManager.listMessages(opts));
  ipcMain.handle('crm:whatsapp:send-message', async (_e, to, body) => waManager.sendMessage(to, body));
  ipcMain.handle('crm:whatsapp:send-template', async (_e, to, name, lang, components) => waManager.sendTemplate(to, name, lang, components));

  // ── WhatsApp: conversations ───────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:list-conversations', async (_e, opts) => waManager.listConversations(opts));
  ipcMain.handle('crm:whatsapp:get-conversation', async (_e, id) => waManager.getConversation(id));

  // ── WhatsApp: templates ───────────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:templates', async (_e, opts) => waManager.getTemplates(opts));
  ipcMain.handle('crm:whatsapp:create-template', async (_e, data) => waManager.createTemplate(data));
  ipcMain.handle('crm:whatsapp:delete-template', async (_e, name) => waManager.deleteTemplate(name));

  // ── WhatsApp: contacts (WA) ───────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:wa-contacts', async (_e, opts) => waManager.listWaContacts(opts));

  // ── WhatsApp: business profile ────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:business-profile', async () => waManager.getBusinessProfile());
  ipcMain.handle('crm:whatsapp:update-business-profile', async (_e, data) => waManager.updateBusinessProfile(data));
  ipcMain.handle('crm:whatsapp:display-name-requests', async () => waManager.getDisplayNameRequests());
  ipcMain.handle('crm:whatsapp:submit-display-name', async (_e, name) => waManager.submitDisplayName(name));

  // ── WhatsApp: phone number ────────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:phone-details', async () => waManager.getPhoneNumberDetails());

  // ── WhatsApp: block users ─────────────────────────────────────────────────
  ipcMain.handle('crm:whatsapp:blocked-users', async () => waManager.listBlockedUsers());
  ipcMain.handle('crm:whatsapp:block-user', async (_e, phone) => waManager.blockUser(phone));
  ipcMain.handle('crm:whatsapp:unblock-user', async (_e, phone) => waManager.unblockUser(phone));

  // ── Sync: Kapso contacts → local DB ──────────────────────────────────────
  ipcMain.handle('crm:sync-kapso-contacts', async () => {
    // 1. Pull all Kapso contacts (paginated)
    let kapsoContacts = [];
    let after = null;
    do {
      const res = await waManager.listWaContacts({ limit: 100, after });
      if (!res?.ok) return { ok: false, error: res?.error || 'Error fetching Kapso contacts' };
      kapsoContacts = kapsoContacts.concat(res.data || []);
      after = res.paging?.cursors?.after && res.paging?.next ? res.paging.cursors.after : null;
    } while (after);

    let created = 0, updated = 0, unchanged = 0;

    for (const kc of kapsoContacts) {
      if (kc.sandbox) continue; // skip sandbox/test contacts
      const phone = String(kc.wa_id || '').replace(/[^0-9]/g, '');
      if (!phone) continue;

      const waName = kc.profile_name || kc.display_name || null;
      const kapsoId = kc.id || null;

      // Build alternate phone variants (Argentina: 549XXXXXXXXX ↔ 54XXXXXXXXX)
      const phoneVariants = [phone];
      if (phone.startsWith('549') && phone.length === 13) {
        phoneVariants.push('54' + phone.slice(3));       // 5491134940534 → 541134940534
      } else if (phone.startsWith('54') && !phone.startsWith('549') && phone.length === 12) {
        phoneVariants.push('549' + phone.slice(2));      // 541134940534 → 5491134940534
      }

      const normalize = `REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '')`;
      const placeholders = phoneVariants.map(() => '?').join(', ');

      // Find ALL local contacts matching any phone variant
      const matches = all(
        `SELECT * FROM contacts WHERE ${normalize} IN (${placeholders}) ORDER BY kapso_id IS NULL ASC, id ASC`,
        phoneVariants
      );
      // ORDER BY: contacts with kapso_id come first (preferred canonical), then oldest by id

      if (matches.length === 0) {
        // No local match — create from Kapso data only if not already owned
        const alreadyOwned = first(`SELECT id FROM contacts WHERE kapso_id = ?`, [kapsoId]);
        if (!alreadyOwned) {
          run(
            `INSERT INTO contacts (name, phone, kapso_id, wa_name) VALUES (?, ?, ?, ?)`,
            [waName || phone, phone, kapsoId, waName]
          );
          created++;
        }
      } else {
        // canonical = first result (already has kapso_id, or oldest)
        const canonical = matches[0];
        const duplicates = matches.slice(1);

        // Merge local data from duplicates into canonical (fill empty fields)
        for (const dup of duplicates) {
          // Transfer non-empty local fields if canonical is empty
          const updates = {};
          if (!canonical.email && dup.email) updates.email = dup.email;
          if (!canonical.company && dup.company) updates.company = dup.company;
          if (!canonical.notes && dup.notes) updates.notes = dup.notes;
          if (Object.keys(updates).length) {
            const sets = Object.keys(updates).map(k => `${k}=?`).join(', ');
            runBatch(`UPDATE contacts SET ${sets} WHERE id=?`, [...Object.values(updates), canonical.id]);
          }
          // Transfer tags
          const dupTags = all(`SELECT tag_id FROM contact_tags WHERE contact_id=?`, [dup.id]);
          for (const { tag_id } of dupTags) {
            try { runBatch(`INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?,?)`, [canonical.id, tag_id]); } catch {}
          }
          // Delete duplicate
          runBatch(`DELETE FROM contacts WHERE id=?`, [dup.id]);
        }

        // Update canonical with kapso_id and wa_name
        if (canonical.kapso_id !== kapsoId || canonical.wa_name !== waName) {
          run(
            `UPDATE contacts SET kapso_id=?, wa_name=?, updated_at=datetime('now') WHERE id=?`,
            [kapsoId, waName, canonical.id]
          );
          updated++;
        } else {
          unchanged++;
        }

        if (duplicates.length) {
          saveDb();
        }
      }
    }

    return { ok: true, total: kapsoContacts.length, created, updated, unchanged };
  });

  // ─── Dashboard stats ──────────────────────────────────────────────────────

  ipcMain.handle('crm:stats', () => ({
    contacts: first(`SELECT COUNT(*) AS n FROM contacts`)?.n ?? 0,
    campaigns: first(`SELECT COUNT(*) AS n FROM campaigns WHERE status='sent'`)?.n ?? 0,
    // messages now come from Kapso API, not local DB
    messagesSent: null,
    messagesIn: null,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTags(row) {
  const tags = row.tags_raw
    ? String(row.tags_raw).split(',').map(raw => {
        const parts = raw.split(':');
        return { id: Number(parts[0]), name: parts[1], color: parts[2] };
      })
    : [];
  const { tags_raw, ...rest } = row;
  return { ...rest, tags };
}

function tryParseJson(val) {
  try { return JSON.parse(val); } catch { return val; }
}

/**
 * Normalize phone to Kapso format: digits only, strip Argentine mobile "9"
 * 5491134940534 → 541134940534 (Kapso wa_id format = country + area + number, no 9)
 */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('549') && p.length === 13) p = '54' + p.slice(3);
  return p;
}

module.exports = { initCrm };
