-- Migration 0004: lookup kendaraan hanya melalui API Data Kendaraan pusat.
--
-- - Petugas yang memiliki 'vehicle_lookup.d1' menerima 'vehicle_lookup.api'
--   (akses lookup yang sudah ada dipertahankan; 'calculator' TIDAK ditambahkan).
-- - Modul lama 'vehicle_lookup.d1' dan 'vehicle_source.settings' dihapus.
--   'vehicle_source.settings' saja tidak pernah memberi akses API.
-- - CHECK constraint user_permissions (0003) tidak diubah: masih mengizinkan
--   kunci lama, sehingga tidak perlu rebuild tabel. Server hanya menulis 4 kunci
--   baru (src/types/auth.ts MODULE_KEYS).
-- - Idempoten: INSERT OR IGNORE + DELETE aman bila dijalankan ulang.
-- - Tabel users, sessions, dan audit_events tidak disentuh.
--
-- DEPLOY/ROLLBACK: cadangkan user_permissions sebelum menerapkan di production.
-- Deploy kode API-only (yang mampu membaca alias izin D1 lama) terlebih dahulu,
-- baru apply migration ini. Jangan hapus izin D1 saat kode lama masih memerlukan
-- gabungan D1+API. Rollback kode saja tidak mengembalikan izin lama; pulihkan
-- izin dari cadangan jika perlu kembali ke versi sebelum API-only.

INSERT OR IGNORE INTO user_permissions (user_id, module_key)
  SELECT user_id, 'vehicle_lookup.api'
  FROM user_permissions
  WHERE module_key = 'vehicle_lookup.d1';

DELETE FROM user_permissions
  WHERE module_key IN ('vehicle_lookup.d1', 'vehicle_source.settings');
