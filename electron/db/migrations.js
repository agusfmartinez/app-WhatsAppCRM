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
  ];
  for (const sql of alterations) {
    try { db.run(sql); } catch {}
  }
}

module.exports = { applyMigrations };
