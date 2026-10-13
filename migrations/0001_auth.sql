-- Migration 0001: autentikasi, otorisasi modul, sesi perangkat, dan audit.
-- Terapkan lokal: npm run db:migrate:local
-- Tabel vehicle_njkb (schema.sql) tidak disentuh.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY NOT NULL,                 -- UUID v4
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,       -- dinormalisasi lowercase oleh server
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'petugas')),
  password_hash TEXT    NOT NULL,                             -- pbkdf2_sha256$<iter>$<salt>$<hash>
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL,                             -- ISO-8601 UTC
  updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN (
    'calculator',
    'vehicle_lookup.d1',
    'vehicle_lookup.api',
    'vehicle_source.settings',
    'facility.tembak_ru'
  )),
  PRIMARY KEY (user_id, module_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT    PRIMARY KEY NOT NULL,              -- UUID v4 (aman ditampilkan)
  user_id          TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash       TEXT    NOT NULL UNIQUE,                   -- SHA-256 hex token cookie; token asli tidak disimpan
  is_petugas       INTEGER NOT NULL CHECK (is_petugas IN (0, 1)), -- snapshot role saat login
  device_label     TEXT    NOT NULL,
  created_at       TEXT    NOT NULL,
  last_seen_at     TEXT    NOT NULL,
  cookie_issued_at TEXT    NOT NULL,                          -- untuk refresh cookie petugas maks 1x/hari
  expires_at       TEXT                                       -- NULL untuk petugas (tidak kedaluwarsa)
);

-- Petugas: maksimal satu sesi aktif. Ditegakkan atomik oleh D1/SQLite.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_single_petugas
  ON sessions(user_id) WHERE is_petugas = 1;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id  TEXT,                                        -- tanpa FK: jejak tetap ada setelah user dihapus
  action         TEXT    NOT NULL,
  target_user_id TEXT,
  created_at     TEXT    NOT NULL,
  metadata       TEXT                                         -- JSON tanpa password/token/hash
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
