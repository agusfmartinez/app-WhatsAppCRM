const { SCHEMA_SQL } = require('./schema');

function applyMigrations(db) {
  // Drop legacy tables (conversations/messages moved to Kapso API)
  db.run('DROP TABLE IF EXISTS messages');
  db.run('DROP TABLE IF EXISTS conversations');

  db.exec(SCHEMA_SQL);

  // Additive column migrations — safe to re-run (SQLite throws on duplicate, we ignore)
  const alterations = [
    "ALTER TABLE campaigns ADD COLUMN template_name TEXT",
    "ALTER TABLE campaigns ADD COLUMN template_language TEXT NOT NULL DEFAULT 'es'",
    "ALTER TABLE campaigns ADD COLUMN template_variables TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE contacts ADD COLUMN kapso_id TEXT",
    "ALTER TABLE contacts ADD COLUMN wa_name TEXT",
    // Kapso Broadcasts integration
    "ALTER TABLE campaigns ADD COLUMN kapso_broadcast_id TEXT",
    "ALTER TABLE campaigns ADD COLUMN template_id TEXT",          // Meta template id used to create the broadcast
    "ALTER TABLE campaigns ADD COLUMN total_recipients INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN delivered_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN responded_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN pending_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN response_rate REAL NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN scheduled_at TEXT",
    "ALTER TABLE campaigns ADD COLUMN started_at TEXT",
    "ALTER TABLE campaigns ADD COLUMN completed_at TEXT",
    "ALTER TABLE campaigns ADD COLUMN stats_frozen INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN stats_updated_at TEXT",
    // Per-recipient template body params (JSON array) — used for CSV-imported recipients
    "ALTER TABLE campaign_contacts ADD COLUMN params TEXT",
    // Origin: 'local' (created in app) | 'kapso' (imported broadcast)
    "ALTER TABLE campaigns ADD COLUMN origin TEXT NOT NULL DEFAULT 'local'",
    // Per-recipient delivery snapshot (from Kapso broadcast recipients)
    "ALTER TABLE campaign_contacts ADD COLUMN delivered_at TEXT",
    "ALTER TABLE campaign_contacts ADD COLUMN read_at TEXT",
    "ALTER TABLE campaign_contacts ADD COLUMN responded_at TEXT",
    "ALTER TABLE campaign_contacts ADD COLUMN failed_at TEXT",
    "ALTER TABLE campaign_contacts ADD COLUMN error_message TEXT",
  ];
  for (const sql of alterations) {
    try { db.run(sql); } catch {}
  }
}

module.exports = { applyMigrations };
