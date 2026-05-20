const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { applyMigrations } = require('./migrations');

let db = null;
let dbPath = null;

async function initDb() {
  if (db) return db;

  const initSqlJs = require('sql.js');

  // Locate the WASM file — works in both dev and packaged (asarUnpack)
  const SQL = await initSqlJs({
    locateFile: (filename) => {
      if (app.isPackaged) {
        return path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'sql.js',
          'dist',
          filename
        );
      }
      return path.join(__dirname, '../../node_modules/sql.js/dist', filename);
    },
  });

  dbPath = path.join(app.getPath('userData'), 'crm.db');

  let buf = null;
  try { buf = fs.readFileSync(dbPath); } catch {}

  db = buf ? new SQL.Database(buf) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  applyMigrations(db);

  if (!buf) saveDb(); // persist the freshly created schema

  return db;
}

function getDb() {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}

function saveDb() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

module.exports = { initDb, getDb, saveDb, closeDb };
