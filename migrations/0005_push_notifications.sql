-- Migration 0005: notifikasi Web Push dan riwayat pengumuman.
--
-- - push_subscriptions: satu baris per perangkat yang mengaktifkan notifikasi.
--   endpoint/p256dh/auth berasal dari PushManager.subscribe() di peramban dan
--   hanya dipakai server untuk mengirim pengumuman. Ikut terhapus bersama user.
-- - announcements: riwayat pengumuman Admin, juga ditampilkan di aplikasi untuk
--   perangkat yang tidak menerima push (iPhone tanpa Layar Utama, izin ditolak).
-- - Idempoten (IF NOT EXISTS). Tabel lain tidak disentuh.
--
-- DEPLOY: apply migration ini ke D1 production sebelum kode notifikasi dipakai.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              TEXT    PRIMARY KEY NOT NULL,                  -- UUID v4
  user_id         TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT    NOT NULL UNIQUE,                       -- URL push service (https)
  p256dh          TEXT    NOT NULL,                              -- kunci publik perangkat (base64url)
  auth            TEXT    NOT NULL,                              -- auth secret perangkat (base64url)
  device_label    TEXT    NOT NULL,                              -- mis. "Chrome · Android"
  created_at      TEXT    NOT NULL,
  last_success_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS announcements (
  id             TEXT    PRIMARY KEY NOT NULL,                   -- UUID v4
  title          TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  created_by     TEXT,                                           -- tanpa FK: riwayat tetap setelah user dihapus
  created_by_name TEXT   NOT NULL,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at);
