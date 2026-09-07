-- Cloudflare D1 Schema: Kalkulator Pajak Kendaraan
-- Jalankan: npx wrangler d1 execute kalkulator-pajak-db --file=./schema.sql [--remote]

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
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_njkb_nopol ON vehicle_njkb(nopol);
