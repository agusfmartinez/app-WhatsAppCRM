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

  ipcMain.handle('crm:contacts:list', (_e, { search = '', tagId = null } = {}) => {
    let sql = `
      SELECT c.id, c.name, c.phone, c.email, c.company, c.notes, c.created_at, c.updated_at,
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
    return all(sql, params).map(parseTags);
  });

  ipcMain.handle('crm:contacts:get', (_e, id) => {
    const row = first(`
      SELECT c.id, c.name, c.phone, c.email, c.company, c.notes, c.created_at, c.updated_at,
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
    const { name, phone, email = null, company = null, notes = null, tagIds = [] } = data;
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

  ipcMain.handle('crm:campaigns:create', (_e, { name, messageTemplate, contactIds = [] }) => {
    const { lastInsertRowid: campaignId } = run(
      `INSERT INTO campaigns (name, message_template, total_contacts) VALUES (?, ?, ?)`,
      [name, messageTemplate, contactIds.length]
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

    let sent = 0;
    let errors = 0;
    for (const row of contacts) {
      try {
        const res = await waManager.sendMessage(row.phone, campaign.message_template);
        if (res.ok) {
          runBatch(`UPDATE campaign_contacts SET status='sent', sent_at=datetime('now') WHERE id=?`, [row.cc_id]);
          sent++;
        } else {
          runBatch(`UPDATE campaign_contacts SET status='error', error=? WHERE id=?`, [res.error ?? 'Unknown error', row.cc_id]);
          errors++;
        }
      } catch (err) {
        runBatch(`UPDATE campaign_contacts SET status='error', error=? WHERE id=?`, [err.message, row.cc_id]);
        errors++;
      }
    }

    runBatch(`UPDATE campaigns SET status='sent', sent_at=datetime('now'), sent_count=?, error_count=? WHERE id=?`, [sent, errors, id]);
    saveDb();

    return { ok: true, sent, errors };
  });

  // ─── Conversations ────────────────────────────────────────────────────────

  ipcMain.handle('crm:conversations:list', () =>
    all(`
      SELECT cv.id, cv.status, cv.last_message_at, cv.created_at,
             c.name AS contact_name, c.phone AS contact_phone
      FROM conversations cv JOIN contacts c ON c.id = cv.contact_id
      ORDER BY cv.last_message_at DESC
    `)
  );

  ipcMain.handle('crm:conversations:get', (_e, id) =>
    first(`
      SELECT cv.*, c.name AS contact_name, c.phone AS contact_phone
      FROM conversations cv JOIN contacts c ON c.id = cv.contact_id
      WHERE cv.id = ?
    `, [id])
  );

  // ─── Messages ─────────────────────────────────────────────────────────────

  ipcMain.handle('crm:messages:list', (_e, conversationId) =>
    all(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`, [conversationId])
  );

  ipcMain.handle('crm:messages:send', async (_e, conversationId, content) => {
    const conv = first(`SELECT * FROM conversations WHERE id = ?`, [conversationId]);
    if (!conv) return { ok: false, error: 'Conversation not found' };
    const contact = first(`SELECT * FROM contacts WHERE id = ?`, [conv.contact_id]);
    if (!contact) return { ok: false, error: 'Contact not found' };

    const res = await waManager.sendMessage(contact.phone, content);
    if (!res.ok) return res;

    const { lastInsertRowid: id } = run(
      `INSERT INTO messages (conversation_id, content, direction, status, sent_at) VALUES (?, ?, 'out', 'sent', datetime('now'))`,
      [conversationId, content]
    );
    runBatch(`UPDATE conversations SET last_message_at=datetime('now') WHERE id=?`, [conversationId]);
    saveDb();
    return { ok: true, id };
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

  ipcMain.handle('crm:whatsapp:status', () => waManager.getStatus());
  ipcMain.handle('crm:whatsapp:connect', async (_e, config) => waManager.connect(config));
  ipcMain.handle('crm:whatsapp:disconnect', async () => waManager.disconnect());
  ipcMain.handle('crm:whatsapp:providers', () => waManager.listProviders());

  // ─── Dashboard stats ──────────────────────────────────────────────────────

  ipcMain.handle('crm:stats', () => ({
    contacts: first(`SELECT COUNT(*) AS n FROM contacts`)?.n ?? 0,
    campaigns: first(`SELECT COUNT(*) AS n FROM campaigns`)?.n ?? 0,
    messagesSent: first(`SELECT COUNT(*) AS n FROM messages WHERE direction='out'`)?.n ?? 0,
    messagesIn: first(`SELECT COUNT(*) AS n FROM messages WHERE direction='in'`)?.n ?? 0,
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

module.exports = { initCrm };
