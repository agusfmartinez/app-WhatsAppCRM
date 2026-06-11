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

  // Bulk import from CSV rows: [{ name, phone, email, company, notes, tags:[] }]
  // Upsert by phone; updates only fill empty fields. Tags matched/created by name.
  ipcMain.handle('crm:contacts:import', (_e, rows) => {
    const tagByName = {};
    all(`SELECT id, name FROM tags`).forEach(t => { tagByName[t.name.trim().toLowerCase()] = t.id; });
    const ensureTag = (name) => {
      const k = String(name || '').trim().toLowerCase();
      if (!k) return null;
      if (tagByName[k]) return tagByName[k];
      const { lastInsertRowid } = run(`INSERT INTO tags (name, color) VALUES (?, ?)`, [String(name).trim(), '#6b7280']);
      tagByName[k] = lastInsertRowid;
      return lastInsertRowid;
    };

    let created = 0, updated = 0, skipped = 0;
    for (const r of rows || []) {
      const phone = String(r?.phone || '').replace(/[^0-9]/g, '');
      if (!phone) { skipped++; continue; }
      const existing = first(`SELECT id FROM contacts WHERE phone = ?`, [phone]);
      let cid;
      if (existing) {
        cid = existing.id;
        runBatch(
          `UPDATE contacts SET name=COALESCE(NULLIF(?,''),name), email=COALESCE(NULLIF(?,''),email),
             company=COALESCE(NULLIF(?,''),company), notes=COALESCE(NULLIF(?,''),notes), updated_at=datetime('now')
           WHERE id=?`,
          [r.name || '', r.email || '', r.company || '', r.notes || '', cid]
        );
        updated++;
      } else {
        const { lastInsertRowid } = run(
          `INSERT INTO contacts (name, phone, email, company, notes) VALUES (?, ?, ?, ?, ?)`,
          [r.name?.trim() || phone, phone, r.email || null, r.company || null, r.notes || null]
        );
        cid = lastInsertRowid;
        created++;
      }
      if (Array.isArray(r.tags)) {
        for (const tn of r.tags) {
          const tid = ensureTag(tn);
          if (tid) runBatch(`INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`, [cid, tid]);
        }
      }
    }
    saveDb();
    return { ok: true, created, updated, skipped };
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
      SELECT cc.id, cc.status, cc.sent_at, cc.error, cc.params,
             cc.delivered_at, cc.read_at, cc.responded_at, cc.failed_at, cc.error_message,
             c.name, c.phone
      FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
      WHERE cc.campaign_id = ?
    `, [id]);
    return { ...campaign, contacts };
  });

  // Upsert a contact by phone (digits only), return its id. Used by CSV import.
  function upsertContactByPhone(phone, name) {
    const norm = String(phone || '').replace(/[^0-9]/g, '');
    if (!norm) return null;
    const existing = first(`SELECT id FROM contacts WHERE phone = ?`, [norm]);
    if (existing) return existing.id;
    const { lastInsertRowid } = run(`INSERT INTO contacts (name, phone) VALUES (?, ?)`, [name?.trim() || norm, norm]);
    return lastInsertRowid;
  }

  // Create a campaign as a local draft. Recipients come from either:
  //  - contactIds[] (segment from CRM; params resolved at send via variableMap), or
  //  - recipients[] (CSV: { phone, name, params[] } → upsert contacts + per-recipient params).
  ipcMain.handle('crm:campaigns:create', (_e, { name, templateId, templateName, templateLanguage = 'es', variableMap = [], contactIds = [], recipients = [] }) => {
    const mapJson = JSON.stringify(variableMap);

    // Build the recipient rows ({ contactId, params }), de-duplicated by contact.
    const rows = [];
    const seen = new Set();
    if (recipients.length) {
      for (const r of recipients) {
        const cid = upsertContactByPhone(r.phone, r.name);
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        rows.push({ contactId: cid, params: Array.isArray(r.params) ? JSON.stringify(r.params) : null });
      }
    } else {
      for (const cid of contactIds) {
        if (seen.has(cid)) continue;
        seen.add(cid);
        rows.push({ contactId: cid, params: null });
      }
    }

    const { lastInsertRowid: campaignId } = run(
      `INSERT INTO campaigns (name, message_template, template_id, template_name, template_language, template_variables, total_contacts) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, templateName, templateId ? String(templateId) : null, templateName, templateLanguage, mapJson, rows.length]
    );
    rows.forEach(row => runBatch(
      `INSERT INTO campaign_contacts (campaign_id, contact_id, params) VALUES (?, ?, ?)`, [campaignId, row.contactId, row.params]
    ));
    saveDb();
    return { ok: true, id: campaignId, total: rows.length };
  });

  ipcMain.handle('crm:campaigns:delete', (_e, id) => {
    // If it maps to a Kapso broadcast, remember it as dismissed so import won't re-add it
    // (Kapso has no delete-broadcast endpoint, the broadcast persists there).
    const c = first(`SELECT kapso_broadcast_id FROM campaigns WHERE id = ?`, [id]);
    if (c?.kapso_broadcast_id) {
      let list = [];
      try { list = JSON.parse(first(`SELECT value FROM settings WHERE key='dismissed_broadcasts'`)?.value || '[]'); } catch {}
      if (!list.includes(c.kapso_broadcast_id)) list.push(c.kapso_broadcast_id);
      run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('dismissed_broadcasts', ?)`, [JSON.stringify(list)]);
    }
    run(`DELETE FROM campaigns WHERE id = ?`, [id]);
    saveDb();
    return { ok: true };
  });

  // Resolve a contact's variables from the campaign's variableMap into Meta body parameters
  function buildComponents(variableMap, contact) {
    if (!variableMap?.length) return [];
    const parameters = variableMap.map(m => {
      const text = m?.source === 'field' ? (contact[m.value] ?? '') : (m?.value ?? '');
      return { type: 'text', text: String(text || ' ') };
    });
    return [{ type: 'body', parameters }];
  }

  // Snapshot a Kapso broadcast payload into the local campaign row.
  const FREEZE_DAYS = 3;
  function applyBroadcastStats(id, b) {
    const completed = b.status === 'completed' || b.status === 'failed';
    // Auto-freeze once completed for more than FREEZE_DAYS (read/responses stop trickling)
    let frozen = 0;
    if (completed && b.completed_at) {
      const ageDays = (Date.now() - new Date(b.completed_at).getTime()) / 86400000;
      if (ageDays >= FREEZE_DAYS) frozen = 1;
    }
    runBatch(`UPDATE campaigns SET
        status=?, total_recipients=?, sent_count=?, error_count=?, delivered_count=?, read_count=?,
        responded_count=?, pending_count=?, response_rate=?, started_at=?, completed_at=?,
        sent_at=COALESCE(completed_at, sent_at), stats_frozen=?, stats_updated_at=datetime('now')
      WHERE id=?`,
      [b.status, b.total_recipients ?? 0, b.sent_count ?? 0, b.failed_count ?? 0, b.delivered_count ?? 0,
       b.read_count ?? 0, b.responded_count ?? 0, b.pending_count ?? 0, b.response_rate ?? 0,
       b.started_at ?? null, b.completed_at ?? null, frozen, id]);
  }

  // Create + populate + send (or schedule) a Kapso broadcast for this campaign.
  ipcMain.handle('crm:campaigns:send', async (_e, id, { scheduledAt = null } = {}) => {
    const campaign = first(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign) return { ok: false, error: 'Campaña no encontrada' };
    if (campaign.status === 'sending' || campaign.status === 'completed') return { ok: false, error: 'La campaña ya fue enviada' };
    if (!campaign.template_id) return { ok: false, error: 'La campaña no tiene un template asociado' };

    const contacts = all(`
      SELECT cc.params, c.name, c.phone, c.email, c.company
      FROM campaign_contacts cc JOIN contacts c ON c.id = cc.contact_id
      WHERE cc.campaign_id = ?
    `, [id]);
    if (!contacts.length) return { ok: false, error: 'La campaña no tiene contactos' };

    let variableMap = [];
    try { variableMap = JSON.parse(campaign.template_variables || '[]'); } catch {}

    // Per-recipient body components: stored CSV params take precedence over field mapping.
    const componentsFor = (c) => {
      if (c.params) {
        let arr = null;
        try { arr = JSON.parse(c.params); } catch {}
        if (Array.isArray(arr) && arr.length) {
          return [{ type: 'body', parameters: arr.map(p => ({ type: 'text', text: String(p || ' ') })) }];
        }
      }
      return buildComponents(variableMap, c);
    };

    // 1. Create draft broadcast
    const created = await waManager.createBroadcast({ name: campaign.name, templateId: campaign.template_id });
    if (!created?.ok) return { ok: false, error: created?.error || 'No se pudo crear el broadcast' };
    const broadcastId = created.data?.id;
    if (!broadcastId) return { ok: false, error: 'Kapso no devolvió el id del broadcast' };

    // 2. Add recipients in batches of 1000. Kapso returns { added, duplicates, errors[] }
    //    per batch (HTTP 201 even with per-recipient validation failures).
    let added = 0, duplicates = 0;
    const warnings = [];
    for (let i = 0; i < contacts.length; i += 1000) {
      const batch = contacts.slice(i, i + 1000).map(c => ({
        phone_number: '+' + String(c.phone).replace(/[^0-9]/g, ''),
        components: componentsFor(c),
      }));
      const addRes = await waManager.addBroadcastRecipients(broadcastId, batch);
      if (!addRes?.ok) return { ok: false, error: addRes?.error || 'Error agregando destinatarios' };
      added += addRes.data?.added ?? 0;
      duplicates += addRes.data?.duplicates ?? 0;
      if (Array.isArray(addRes.data?.errors)) warnings.push(...addRes.data.errors);
    }
    if (added === 0) {
      return { ok: false, error: `Ningún destinatario válido. ${warnings.slice(0, 3).join(' · ') || 'Revisá teléfonos y parámetros.'}` };
    }

    // 3. Send now or schedule
    const action = scheduledAt
      ? await waManager.scheduleBroadcast(broadcastId, scheduledAt)
      : await waManager.sendBroadcast(broadcastId);
    if (!action?.ok) return { ok: false, error: action?.error || 'Error al enviar el broadcast' };

    runBatch(`UPDATE campaigns SET kapso_broadcast_id=?, status=?, scheduled_at=?, total_recipients=?, started_at=datetime('now') WHERE id=?`,
      [broadcastId, scheduledAt ? 'scheduled' : 'sending', scheduledAt, added, id]);
    saveDb();
    return { ok: true, broadcastId, added, duplicates, warnings };
  });

  // Poll Kapso for live stats and snapshot them locally (skips frozen campaigns).
  ipcMain.handle('crm:campaigns:refresh-stats', async (_e, id) => {
    const campaign = first(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign) return { ok: false, error: 'Campaña no encontrada' };
    if (campaign.stats_frozen || !campaign.kapso_broadcast_id) {
      return { ok: true, campaign }; // nothing to refresh
    }
    const res = await waManager.getBroadcast(campaign.kapso_broadcast_id);
    if (!res?.ok) return { ok: false, error: res?.error || 'Error consultando el broadcast' };
    applyBroadcastStats(id, res.data || {});
    saveDb();
    return { ok: true, campaign: first(`SELECT * FROM campaigns WHERE id = ?`, [id]) };
  });

  // Snapshot a broadcast's recipients into local contacts + campaign_contacts (once).
  async function snapshotRecipients(campaignId, broadcastId) {
    if (first(`SELECT 1 FROM campaign_contacts WHERE campaign_id = ? LIMIT 1`, [campaignId])) return;
    const res = await waManager.listBroadcastRecipients(broadcastId, { perPage: 500 });
    if (!res?.ok) return;
    const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    for (const r of list) {
      const phone = String(r.phone_number || '').replace(/[^0-9]/g, '');
      if (!phone) continue;
      const cid = upsertContactByPhone(phone, null);
      if (!cid) continue;
      const body = (r.template_components || []).find(c => String(c.type || '').toLowerCase() === 'body');
      const params = (body?.parameters || []).map(p => p.text ?? '');
      runBatch(
        `INSERT INTO campaign_contacts (campaign_id, contact_id, status, params, sent_at, delivered_at, read_at, responded_at, failed_at, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [campaignId, cid, r.status || 'pending', JSON.stringify(params), r.sent_at || null, r.delivered_at || null,
         r.read_at || null, r.responded_at || null, r.failed_at || null, r.error_message || null]
      );
    }
  }

  // Import broadcasts created directly in Kapso into the local campaigns table.
  ipcMain.handle('crm:campaigns:import-broadcasts', async () => {
    const res = await waManager.listBroadcasts({ perPage: 100 });
    if (!res?.ok) return { ok: false, error: res?.error || 'Error listando broadcasts' };
    const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    let dismissed = [];
    try { dismissed = JSON.parse(first(`SELECT value FROM settings WHERE key='dismissed_broadcasts'`)?.value || '[]'); } catch {}
    let imported = 0, updated = 0;
    for (const b of list) {
      if (!b?.id || dismissed.includes(b.id)) continue;
      const tplName = b.whatsapp_template?.name || '';
      const tplId = b.whatsapp_template?.meta_template_id || b.whatsapp_template?.id || null;
      const existing = first(`SELECT id, origin FROM campaigns WHERE kapso_broadcast_id = ?`, [b.id]);
      let campaignId;
      if (existing) {
        campaignId = existing.id;
        applyBroadcastStats(campaignId, b);
        // Backfill origin for imports that predate the origin column (no local recipients = imported)
        const hasLocal = first(`SELECT 1 FROM campaign_contacts WHERE campaign_id = ? LIMIT 1`, [campaignId]);
        if (!hasLocal) runBatch(`UPDATE campaigns SET origin='kapso' WHERE id = ?`, [campaignId]);
        updated++;
      } else {
        const ins = run(
          `INSERT INTO campaigns (name, message_template, template_id, template_name, kapso_broadcast_id, status, origin, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'kapso', COALESCE(?, datetime('now')))`,
          [b.name || 'Broadcast', tplName, tplId ? String(tplId) : null, tplName, b.id, b.status || 'draft', b.created_at || null]
        );
        campaignId = ins.lastInsertRowid;
        applyBroadcastStats(campaignId, b);
        imported++;
      }
      // Pull recipients into the local CRM only once the broadcast is final
      // (avoids snapshotting stale 'pending' rows). no-ops if already snapshotted.
      if (b.status === 'completed' || b.status === 'failed') await snapshotRecipients(campaignId, b.id);
    }
    saveDb();
    return { ok: true, imported, updated };
  });

  // Per-recipient delivery status for a campaign's broadcast (live from Kapso).
  ipcMain.handle('crm:campaigns:recipients', async (_e, id) => {
    const campaign = first(`SELECT kapso_broadcast_id FROM campaigns WHERE id = ?`, [id]);
    if (!campaign?.kapso_broadcast_id) return { ok: false, error: 'Sin broadcast asociado' };
    const res = await waManager.listBroadcastRecipients(campaign.kapso_broadcast_id, { perPage: 500 });
    if (!res?.ok) return res;
    return { ok: true, recipients: Array.isArray(res.data) ? res.data : (res.data?.data || []) };
  });

  // Cancel a scheduled broadcast → back to draft locally.
  ipcMain.handle('crm:campaigns:cancel', async (_e, id) => {
    const campaign = first(`SELECT * FROM campaigns WHERE id = ?`, [id]);
    if (!campaign?.kapso_broadcast_id) return { ok: false, error: 'Sin broadcast asociado' };
    const res = await waManager.cancelBroadcast(campaign.kapso_broadcast_id);
    if (!res?.ok) return { ok: false, error: res?.error || 'No se pudo cancelar' };
    runBatch(`UPDATE campaigns SET status='draft', scheduled_at=NULL WHERE id=?`, [id]);
    saveDb();
    return { ok: true };
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
