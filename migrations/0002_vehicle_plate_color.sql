-- Migration 0002: warna plat (TNKB) pada vehicle_njkb.
-- Terapkan lokal : npm run db:migrate:local
-- Terapkan remote: npx wrangler d1 migrations apply kalkulator-pajak-db --remote
--
-- - Nullable tanpa backfill: NULL = sumber tidak menyediakan warna plat; frontend
--   memakai default "putih" dan user dapat mengubah manual.
-- - Plat kuning sengaja tidak didukung (dihitung di loket).
-- - SQLite ADD COLUMN tidak menulis ulang baris. Namun karena tabel memiliki
--   CHECK constraint (njkb/njub/bobot dan kolom baru ini), SQLite ≥ 3.37
--   MEMBACA seluruh baris sekali untuk memverifikasi CHECK. Semua nilai baru
--   NULL sehingga lolos; pada ±920 ribu baris ini menambah rows-read dan
--   menahan write sebentar selama migration.
-- - Terapkan SEBELUM menjalankan seed baru (seed menulis kolom warna_plat).
-- - Bila schema.sql dijalankan ulang (DROP + CREATE), kolom ini hilang sementara
--   d1_migrations tetap mencatat 0002; terapkan ulang file ini secara manual.

ALTER TABLE vehicle_njkb ADD COLUMN warna_plat TEXT
  CHECK (warna_plat IS NULL OR warna_plat IN ('putih', 'hitam', 'merah'));
