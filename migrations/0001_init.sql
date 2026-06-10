-- VeroCRM — schema iniziale (Cloudflare D1)
-- Applica con: wrangler d1 execute verocrm-db --file migrations/0001_init.sql
-- Database: verocrm-db (uuid 3396fdd0-12bc-4f7f-9eeb-f5f412ed3b77)

PRAGMA foreign_keys = ON;

-- ── AZIENDE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aziende (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'prospect',   -- cliente | prospect | pa
  piva        TEXT,
  email       TEXT,
  telefono    TEXT,
  citta       TEXT,
  provincia   TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── CONTATTI ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contatti (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  azienda_id  INTEGER REFERENCES aziende(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL,
  ruolo       TEXT,
  email       TEXT,
  telefono    TEXT,
  stato       TEXT NOT NULL DEFAULT 'lead',       -- lead | active | cold
  priorita    INTEGER NOT NULL DEFAULT 1,         -- 1..3
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contatti_azienda ON contatti(azienda_id);
CREATE INDEX IF NOT EXISTS idx_contatti_stato   ON contatti(stato);

-- ── TRATTATIVE (pipeline) ────────────────────────────────
CREATE TABLE IF NOT EXISTS trattative (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  azienda_id  INTEGER REFERENCES aziende(id)  ON DELETE CASCADE,
  contatto_id INTEGER REFERENCES contatti(id) ON DELETE SET NULL,
  titolo      TEXT NOT NULL,
  fase        TEXT NOT NULL DEFAULT 'lead',       -- lead|qualificato|proposta|negoziazione|vinta|persa
  valore      REAL NOT NULL DEFAULT 0,
  probabilita INTEGER NOT NULL DEFAULT 0,         -- 0..100
  owner       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trattative_azienda ON trattative(azienda_id);
CREATE INDEX IF NOT EXISTS idx_trattative_fase    ON trattative(fase);

-- ── PREVENTIVI ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preventivi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  numero        TEXT,
  azienda_id    INTEGER REFERENCES aziende(id)    ON DELETE SET NULL,
  contatto_id   INTEGER REFERENCES contatti(id)   ON DELETE SET NULL,
  trattativa_id INTEGER REFERENCES trattative(id) ON DELETE SET NULL,
  stato         TEXT NOT NULL DEFAULT 'draft',     -- draft|sent|won|lost
  imponibile    REAL NOT NULL DEFAULT 0,
  iva_perc      REAL NOT NULL DEFAULT 22,
  totale        REAL NOT NULL DEFAULT 0,
  data          TEXT NOT NULL DEFAULT (date('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_preventivi_azienda ON preventivi(azienda_id);

-- ── RIGHE PREVENTIVO ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS preventivo_righe (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  preventivo_id INTEGER NOT NULL REFERENCES preventivi(id) ON DELETE CASCADE,
  descrizione   TEXT NOT NULL,
  quantita      REAL NOT NULL DEFAULT 1,
  prezzo        REAL NOT NULL DEFAULT 0,
  totale        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_righe_preventivo ON preventivo_righe(preventivo_id);

-- ── ATTIVITÀ ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attivita (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT NOT NULL DEFAULT 'task',      -- task|call|email|meeting|ticket
  titolo        TEXT NOT NULL,
  azienda_id    INTEGER REFERENCES aziende(id)    ON DELETE CASCADE,
  contatto_id   INTEGER REFERENCES contatti(id)   ON DELETE SET NULL,
  trattativa_id INTEGER REFERENCES trattative(id) ON DELETE SET NULL,
  scadenza      TEXT,                              -- ISO date/datetime
  completata    INTEGER NOT NULL DEFAULT 0,        -- 0|1
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attivita_scadenza ON attivita(scadenza);
CREATE INDEX IF NOT EXISTS idx_attivita_completata ON attivita(completata);
