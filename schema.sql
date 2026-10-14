-- Cloudflare D1 Schema: Kalkulator Pajak Kendaraan
-- Jalankan: npx wrangler d1 execute kalkulator-pajak-db --file=./schema.sql [--remote]
--
-- PERINGATAN: file ini menghapus (DROP) seluruh data vehicle_njkb. JANGAN jalankan
-- di production. Setelah dijalankan ulang, terapkan kolom warna_plat secara manual:
--   npx wrangler d1 execute kalkulator-pajak-db --file=./migrations/0002_vehicle_plate_color.sql

DROP TABLE IF EXISTS vehicle_njkb;

CREATE TABLE vehicle_njkb (
  nopol              TEXT    PRIMARY KEY NOT NULL,  -- Nomor polisi, uppercase tanpa spasi
  nama               TEXT,                          -- Nama pemilik kendaraan
  jenis              TEXT,                          -- Jenis kendaraan (SEPEDA MOTOR, MINIBUS, dll)
  jatuh_tempo_stnk   TEXT,                          -- Tanggal SD STNK format ISO YYYY-MM-DD
  jatuh_tempo_pajak  TEXT,                          -- Tanggal SD Notice format ISO YYYY-MM-DD
  njkb               INTEGER NOT NULL DEFAULT 0 CHECK (njkb >= 0),    -- Nilai Jual Kendaraan Bermotor (Rp)
  njub               INTEGER NOT NULL DEFAULT 0 CHECK (njub >= 0),    -- Nilai Jual Ubah Bentuk (Rp)
  bobot              REAL    NOT NULL DEFAULT 1.0 CHECK (bobot > 0),  -- Koefisien bobot kendaraan
  -- Kolom warna_plat (TNKB) SENGAJA tidak didefinisikan di sini: ditambahkan oleh
  -- migrations/0002_vehicle_plate_color.sql. Alur install: jalankan schema.sql lalu
  -- `wrangler d1 migrations apply` — mendefinisikannya di sini membuat 0002 gagal
  -- ("duplicate column name"). NULL = tidak diketahui → frontend default putih.
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_njkb_nopol ON vehicle_njkb(nopol);
