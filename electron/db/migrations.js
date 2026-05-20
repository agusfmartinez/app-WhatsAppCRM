const { SCHEMA_SQL } = require('./schema');

function applyMigrations(db) {
  // Run all CREATE TABLE IF NOT EXISTS statements
  db.exec(SCHEMA_SQL);
}

module.exports = { applyMigrations };
