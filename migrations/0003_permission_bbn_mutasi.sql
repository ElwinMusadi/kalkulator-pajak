-- Migration 0003: izinkan module_key 'fees.bbn_mutasi' pada user_permissions.
--
-- Tujuan: CHECK constraint user_permissions.module_key (dibuat di 0001_auth.sql)
-- hanya mengizinkan 5 modul lama, sehingga pemberian modul baru 'fees.bbn_mutasi'
-- (src/types/auth.ts MODULE_KEYS) gagal dengan CHECK constraint failed.
-- SQLite tidak dapat mengubah CHECK lewat ALTER TABLE, jadi tabel dibangun ulang:
-- buat tabel baru, salin seluruh baris, hapus tabel lama, rename tabel baru.
--
-- JANGAN mengedit 0001_auth.sql: migration yang sudah diterapkan bersifat immutable.
--
-- Catatan D1:
-- - Wrangler menjalankan file ini dalam satu transaksi; bila ada statement gagal,
--   seluruh perubahan di-rollback dan data lama tetap utuh.
-- - D1 selalu menegakkan foreign key dan tidak mengizinkan PRAGMA foreign_keys.
--   defer_foreign_keys menunda pemeriksaan FK hingga akhir transaksi.
-- - Tidak ada tabel yang mereferensikan user_permissions, sehingga DROP aman.
-- - user_permissions tidak memiliki index selain PRIMARY KEY (lihat 0001).

PRAGMA defer_foreign_keys = true;

-- Sisa tabel sementara dari percobaan yang gagal (seharusnya tidak ada karena transaksi).
DROP TABLE IF EXISTS user_permissions_new;

CREATE TABLE user_permissions_new (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN (
    'calculator',
    'vehicle_lookup.d1',
    'vehicle_lookup.api',
    'vehicle_source.settings',
    'facility.tembak_ru',
    'fees.bbn_mutasi'
  )),
  PRIMARY KEY (user_id, module_key)
);

INSERT INTO user_permissions_new (user_id, module_key)
  SELECT user_id, module_key FROM user_permissions;

DROP TABLE user_permissions;

ALTER TABLE user_permissions_new RENAME TO user_permissions;

PRAGMA defer_foreign_keys = false;
