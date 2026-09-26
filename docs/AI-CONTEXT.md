# AI Context Snapshot: Kalkulator Pajak Kendaraan NTT

Dokumen ini berisi rangkuman teknis, arsitektur, alur data, rumus perhitungan pajak, skema basis data, dan batasan implementasi pada repositori ini per September 2026. Ditujukan sebagai acuan cepat bagi engineer AI/developer sebelum melanjutkan pengembangan atau integrasi dengan NJKB API NTT.

---

## 1. Project Overview

- **Nama Project**: `kalkulator-pajak`
- **Tujuan**: Aplikasi web kalkulator Pajak Kendaraan Bermotor (PKB), Opsen PKB, SWDKLLJ, dan PNBP berdasarkan **Peraturan Gubernur Nusa Tenggara Timur Nomor 54 Tahun 2026** serta Surat Edaran Pedoman Pelaksanaan Nomor `900.1.13.1/2741/BPAD2.1`.
- **Pengguna Sasaran**: Wajib pajak dan petugas UPTD Pendapatan Daerah Wilayah Kota Kupang, Badan Pendapatan dan Aset Daerah (BPAD) Provinsi NTT.
- **Production Domain**: `https://kalkulator.uptdpenda-kupang.web.id`
- **Target Deployment**: Cloudflare Pages + Cloudflare Pages Functions + Cloudflare D1.

---

## 2. Architecture & Tech Stack

- **Frontend**:
  - React 19 (`19.2.8`) + React DOM (`19.2.8`)
  - TypeScript (`~6.0.2`) dengan `target: es2023`, `moduleResolution: bundler`, `noEmit: true`
  - Vite (`8.2.2`) via `@vitejs/plugin-react` (`6.1.0`)
- **Styling**:
  - Tailwind CSS v4 (`4.3.3`) via `@tailwindcss/vite` (`4.3.3`)
  - Konfigurasi CSS-first di `src/index.css` (`@theme inline`, custom token semantik `--success`, `--warning`, `--info`)
  - Typography: `Inter` untuk heading & angka tabular (`.numeric`), `Manrope` untuk teks isi
- **UI Components**:
  - Radix UI primitives (`accordion`, `checkbox`, `dialog`, `label`, `popover`, `select`, `separator`, `slot`, `switch`, `tooltip`)
  - Mobile bottom drawer menggunakan `vaul` (`1.1.2`)
  - Date picking menggunakan `react-day-picker` (`8.10.2`) + `date-fns` (`3.6.0`, dikunci di v3 agar kompatibel dengan peer dependencies)
  - Ikon: `lucide-react` (`1.41.0`)
  - Utilitas class: `clsx` (`2.1.1`) + `tailwind-merge` (`3.6.0`) via `src/lib/utils.ts`
- **PWA (Progressive Web App)**:
  - `vite-plugin-pwa` (`1.3.0`) dengan Workbox
  - Precache asset statis, service worker registration mode `prompt`
  - Runtime caching `NetworkFirst` untuk rute `/api/njkb/*` (TTL 7 hari, max 300 entri)
  - Aset ikon bersumber dari lambang NTT (`public/icons/pwa-*.png`, `apple-touch-icon-180x180.png`)
- **Backend / Serverless**:
  - Cloudflare Pages Functions di folder `functions/api/njkb/[nopol].ts`
  - Runtime flag `nodejs_compat` di `wrangler.toml`
- **Database**:
  - Cloudflare D1 (SQLite serverless)
  - Binding nama: `DB`
  - Database name: `kalkulator-pajak-db`
  - Database ID: `2de80ff7-66be-4d45-81e4-7f98e3403c65`
- **Testing**:
  - Regression testing berbasis assertion Node.js murni via `tsx tests/tax-calculator.regression.ts`

---

## 3. Repository Structure

```text
kalkulator-pajak/
├── functions/
│   └── api/
│       └── njkb/
│           └── [nopol].ts              # Cloudflare Pages Function endpoint: GET /api/njkb/:nopol
├── public/
│   ├── _headers                        # Caching policy Cloudflare Pages (sw.js no-cache, assets immutable)
│   ├── favicon.svg
│   ├── logo-ntt.png                    # Lambang Pemprov NTT
│   └── icons/                          # Ikon PWA (192, 512, maskable 512, apple touch 180)
├── scripts/
│   └── seed-d1.ts                      # Parser Excel -> SQL batches untuk inisialisasi D1
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── ui/                         # shadcn/radix reusable primitives (accordion, button, card, etc.)
│   │   ├── app-header.tsx              # Header institusi: Logo, UPTD Kupang, badge Pergub, PWA button
│   │   ├── date-picker-field.tsx       # DatePicker wrapper (Popover + Calendar + Radix Field)
│   │   ├── facility-toggle.tsx         # Switch custom untuk opsi fasilitas/keringanan
│   │   ├── form-step-accordion.tsx     # Wrapper controlled accordion untuk langkah form
│   │   ├── mobile-result-bar.tsx       # Floating bar bawah (mobile) + drawer rincian penetapan
│   │   ├── nopol-lookup-status.tsx     # Indikator loading/success/not-found/error nomor polisi
│   │   ├── pwa-install-prompt.tsx      # Desktop header button & mobile card untuk install PWA
│   │   ├── pwa-update-notice.tsx       # Prompt reload saat service worker mendeteksi versi baru
│   │   ├── result-breakdown.tsx        # Accordion rincian per kategori (PKB, Opsen, SWDKLLJ, PNBP)
│   │   ├── result-empty.tsx            # Placeholder visual sebelum penetapan dihitung
│   │   ├── result-summary.tsx          # Panel ringkasan penetapan, total bayar, copy ke clipboard
│   │   ├── tax-calculator-form.tsx     # Form utama 4 tahap dengan controlled accordion & auto-reset
│   │   └── tax-result-panel.tsx        # Desktop wrapper yang merender ResultSummary
│   ├── hooks/
│   │   ├── use-debounce.ts             # Generic value debounce hook (default 400ms)
│   │   ├── use-nopol-lookup.ts         # Hook pencarian Nopol via API, abort in-flight, reset cepat
│   │   ├── use-online-status.ts        # Hook deteksi konektivitas navigator.onLine
│   │   └── use-pwa.ts                  # Hook pembungkus useRegisterSW virtual:pwa-register/react
│   ├── lib/
│   │   ├── api.ts                      # Client wrapper memanggil endpoint /api/njkb/:nopol
│   │   ├── format.ts                   # Helper formatRupiah, formatDateDisplay, formatIsoToDisplay
│   │   ├── tax-calculator.ts           # Mesin perhitungan pajak (calculateTax) murni tanpa side-effect
│   │   └── utils.ts                    # Helper cn (clsx + twMerge)
│   ├── types/
│   │   └── tax.ts                      # Domain types: JenisKendaraan, BOBOT_MAP, VehicleData, TaxCalculatorInput, TaxCalculationResult
│   ├── App.tsx                         # Shell layout aplikasi (Desktop 2-kolom, Mobile adaptive)
│   ├── index.css                       # Entry point Tailwind v4, CSS variables, typography, animations
│   ├── main.tsx                        # Entry point React DOM
│   └── vite-env.d.ts                   # Types untuk client Vite & PWA register
├── tests/
│   └── tax-calculator.regression.ts    # Test suite regresi validasi Pergub 54/2026
├── data-kendaraan/                     # (Gitignored) File dataset Excel & dokumen pedoman pergub
├── seed/                               # (Gitignored) Output batch SQL hasil generate seed-d1.ts
├── schema.sql                          # Skema tabel SQLite D1 untuk vehicle_njkb
├── wrangler.toml                       # Konfigurasi Cloudflare Pages & D1 database binding
├── vite.config.ts                      # Konfigurasi bundler Vite, Tailwind, dan PWA
├── package.json                        # Dependencies & npm scripts
└── tsconfig.json                       # Konfigurasi TypeScript project references
```

---

## 4. Current Features

1. **Pencarian Data Kendaraan Otomatis**:
   - Memasukkan nomor polisi memicu pencarian ter-debounce (450ms) ke `/api/njkb/:nopol`.
   - Menghapus atau mengubah satu karakter Nopol langsung mereset seluruh form dan hasil ke kondisi kosong (kecuali tanggal bayar yang tetap tanggal hari ini).
2. **Kalkulasi Otomatis (Live Calculation)**:
   - Jika data Nopol ditemukan lengkap di database, field otomatis terisi dan kalkulator langsung menghitung hasil tanpa perlu menekan tombol "Hitung Penetapan".
3. **Form 4-Tahap Progresif (Controlled Accordion)**:
   - **Tahap 1: Identitas Kendaraan** (Nopol, status pencarian inline) — selalu terbuka.
   - **Tahap 2: Dasar Pengenaan** (NJKB, NJUB ubah bentuk, Jenis Kendaraan, Bobot) — accordion tertutup default; terbuka otomatis bila Nopol `not_found` atau data belum lengkap.
   - **Tahap 3: Masa Pajak** (Jatuh Tempo Pajak, Jatuh Tempo STNK, Tanggal Pembayaran) — accordion tertutup default; terbuka otomatis bila Nopol `not_found` atau tanggal belum lengkap.
   - **Tahap 4: Fasilitas & Biaya Tambahan** (Wilayah Gempa 75%, Mutasi Masuk 50%, Tembak RU/STNK) — accordion tertutup default (1 kolom 3 baris); otomatis terbuka bila ada fasilitas yang aktif.
4. **Validasi Interaktif**:
   - Jika submit ditekan saat ada data wajib kosong, accordion tahap yang bersangkutan otomatis terbuka dan field ditandai `aria-invalid`.
5. **Ringkasan Penetapan & Rincian Kategori**:
   - Menampilkan total bayar dominan.
   - Accordion rincian nominal per kategori (PKB, Opsen PKB, SWDKLLJ, PNBP/STNK/TNKB).
   - Penjelasan status pembebasan sanksi administratif (Tax Amnesty).
   - Fitur salin ringkasan ke clipboard dalam format teks terstruktur.
6. **Responsif Desktop & Mobile**:
   - Desktop: Tampilan 2 kolom yang dipadatkan agar pas dalam viewport tanpa scroll vertikal berlebih.
   - Mobile: Form bertahap, floating sticky bar untuk total bayar di bagian bawah, serta Drawer untuk membuka rincian lengkap.
7. **Dukungan PWA & Offline**:
   - PWA installable di Android (prompt banner) dan iOS (instruksi Add to Home Screen).
   - Tombol "Instal" ringkas di header desktop.
   - Cache lokal untuk Nopol yang pernah dicari saat online.
   - Mode offline tetap mengizinkan perhitungan manual penuh.

---

## 5. Vehicle/NJKB Data Flow

```text
[Input Nopol]
     │
     ▼
[useNopolLookup hook] (debounce 450ms, abort controller)
     │
     ▼
[fetchVehicleByNopol (src/lib/api.ts)]
     │
     ▼ GET /api/njkb/:nopol
[Cloudflare Pages Function (functions/api/njkb/[nopol].ts)]
     │
     ▼ SQL prepared statement: SELECT ... FROM vehicle_njkb WHERE nopol = ?
[Cloudflare D1 Database]
     │
     ├─► Jika Ditemukan (200 JSON):
     │    - Autofill NJKB, NJUB, Bobot, Jenis Kendaraan, Jatuh Tempo Pajak, Jatuh Tempo STNK.
     │    - Tahap 2 & 3 tetap tertutup jika data lengkap.
     │    - Otomatis trigger calculateTax() -> Tampilkan hasil penetapan.
     │
     ├─► Jika Tidak Ditemukan (404):
     │    - Status set 'not_found'.
     │    - Otomatis buka accordion Tahap 2 (Dasar Pengenaan) & Tahap 3 (Masa Pajak).
     │    - Pengguna mengisi data manual.
     │
     └─► Jika Error / Offline (500 / Network Error):
          - Status set 'error', tampilkan pesan bahwa pencarian offline belum tersedia.
```

---

## 6. Tax Calculation Flow (Pergub NTT No. 54 Tahun 2026)

Implementasi berada di `src/lib/tax-calculator.ts` melalui fungsi murni `calculateTax(input: TaxCalculatorInput): TaxCalculationResult`.

### A. Komponen Input & Dasar Pengenaan (DP)
- `dasarPenuh = (njkb + njub) * bobot`
- Bobot kendaraan (`BOBOT_MAP`):
  - Sepeda Motor: `1.0`
  - Minibus: `1.05`
  - Pick Up: `1.085`
  - Sedan: `1.025`
  - Jeep: `1.05`
  - Light Truck: `1.30`
  - Microbus: `1.085`
  - Truck: `1.40`

### B. Penentuan Masa Pajak & Cutoff Opsen
- Cutoff Opsen & Perubahan Tarif: **5 Januari 2025 (`2025-01-05T00:00:00`)**.
- Periode dihitung berbasis tahun kalender dari tahun jatuh tempo pajak sampai tahun pembayaran.
- Tahun sebelum tahun bayar dikategorikan sebagai **tunggakan** (maksimal 4 tahun tunggakan terakhir).
- Tahun pembayaran dikategorikan sebagai **tahun berjalan** (1 tahun).

### C. Tarif & Opsen PKB
1. **Periode sebelum 5 Januari 2025**:
   - Tarif PKB: `1.5%`
   - Opsen PKB: `0%` (belum berlaku)
2. **Periode mulai 5 Januari 2025 ke atas**:
   - Tarif PKB: `1.2%`
   - Opsen PKB: `66%` dari pokok PKB yang dikenakan

### D. Keringanan & Diskon PKB
- **Diskon Tunggakan**:
  - Wilayah terdampak gempa Flores (Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, Manggarai Barat): diskon pokok tunggakan `75%`.
  - Wilayah lainnya: diskon pokok tunggakan `50%`.
  - Opsen tunggakan dihitung `66%` dari pokok PKB tunggakan setelah diskon (hanya untuk periode $\ge$ 5 Jan 2025).
- **Pengurangan Dasar Pengenaan Tahun Berjalan**:
  - Jika **tidak ada tunggakan** DAN masa pajak berjalan masuk rezim Opsen ($\ge$ 5 Jan 2025): Dasar Pengenaan mendapat pengurang `17.5%` (faktor pengali `0.825`).
  - Jika terdapat tunggakan: Dasar Pengenaan tahun berjalan dihitung penuh (`100%`).
- **Diskon Pembayaran Awal Tahun Berjalan** (hanya berlaku jika tidak ada tunggakan dan bayar $\le$ tanggal jatuh tempo):
  - Sepeda Motor:
    - 0 – 30 hari sebelum JT: diskon `10%`
    - 31 – 60 hari sebelum JT: diskon `15%`
    - 61 – 90 hari sebelum JT: diskon `20%`
  - Roda 4 dan seterusnya:
    - 0 – 90 hari sebelum JT: diskon `10%`
  - **Fasilitas Mutasi Masuk Luar Daerah**: Diskon PKB berjalan flat `50%` (menggantikan diskon pembayaran awal).

### E. Denda & Sanksi Administratif (Tax Amnesty)
- **Denda PKB**: Dihapus `100%` (`dendaPkb = 0`).
- **Denda Opsen PKB**: Dihapus `100%` (`dendaOpsen = 0`).

### F. SWDKLLJ (Sumbangan Wajib Dana Kecelakaan Lalu Lintas Jalan)
- Pokok berjalan: Motor `Rp35.000`, Mobil/Truk `Rp143.000`.
- Pokok tunggakan: `jumlah_tahun_tunggakan * tarif_pokok`.
- **Denda SWDKLLJ**: **TETAP DIPUNGUT** (tidak dihapus oleh Tax Amnesty, merujuk contoh resmi Lampiran SE).
  - Keterlambatan $\le$ 3 bulan: Motor `Rp8.000` / Mobil `Rp35.000`
  - Keterlambatan 4 – 6 bulan: Motor `Rp16.000` / Mobil `Rp70.000`
  - Keterlambatan 7 – 9 bulan: Motor `Rp24.000` / Mobil `Rp100.000`
  - Keterlambatan > 9 bulan: Motor `Rp32.000` / Mobil `Rp100.000`

### G. PNBP (Penerimaan Negara Bukan Pajak) & Biaya Tambahan
- Berlaku jika sisa masa berlaku STNK $\le$ 90 hari dari tanggal bayar:
  - PNBP STNK: Motor `Rp100.000`, Mobil `Rp200.000`
  - PNBP TNKB: Motor `Rp60.000`, Mobil `Rp100.000`
- Opsi Tembak RU / STNK (opsional): Motor `Rp150.000`, Mobil `Rp250.000`.

---

## 7. API & Cloudflare D1

### A. Endpoint Spesifikasi
- **Route**: `GET /api/njkb/:nopol`
- **File**: `functions/api/njkb/[nopol].ts`
- **Parameter**: `:nopol` (dinormalisasi: uppercase, strip spasi & karakter non-alfanumerik)
- **Validasi**: Panjang string 4 s.d. 12 karakter; jika gagal return HTTP `400`.
- **Query D1**:
  ```sql
  SELECT nopol, nama, jenis, jatuh_tempo_stnk, jatuh_tempo_pajak, njkb, njub, bobot
  FROM vehicle_njkb
  WHERE nopol = ?
  LIMIT 1;
  ```
- **Response 200 OK**:
  ```json
  {
    "nopol": "DH2506KA",
    "nama": "MARTINA GRACEANA ANGKAT",
    "jenis": "SEPEDA MOTOR",
    "jatuhTempoStnk": "2023-09-13",
    "jatuhTempoPajak": "2023-09-13",
    "njkb": 11500000,
    "njub": 0,
    "bobot": 1.0
  }
  ```
- **Response 404 Not Found**:
  ```json
  { "message": "Data NJKB untuk Nopol tersebut tidak ditemukan." }
  ```
- **Headers**: CORS enabled (`*`), Cache-Control `public, max-age=300` untuk 200 OK.

### B. Skema Database D1 (`schema.sql`)
```sql
CREATE TABLE vehicle_njkb (
  nopol              TEXT    PRIMARY KEY NOT NULL,
  nama               TEXT,
  jenis              TEXT,
  jatuh_tempo_stnk   TEXT,  -- ISO YYYY-MM-DD
  jatuh_tempo_pajak  TEXT,  -- ISO YYYY-MM-DD
  njkb               INTEGER NOT NULL DEFAULT 0 CHECK (njkb >= 0),
  njub               INTEGER NOT NULL DEFAULT 0 CHECK (njub >= 0),
  bobot              REAL    NOT NULL DEFAULT 1.0 CHECK (bobot > 0),
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_njkb_nopol ON vehicle_njkb(nopol);
```

### C. Seeder Database (`scripts/seed-d1.ts`)
- Membaca workbook `data-kendaraan/Data Kendaraan New.xlsx`.
- Normalisasi nopol, konversi rupiah & bobot, validasi tanggal (tahun dibatasi 2000–2100).
- Memecah data ke dalam 19 file batch SQL (`seed/vehicles/0001.sql` s.d. `0019.sql`) dengan klausa `ON CONFLICT(nopol) DO UPDATE`.
- Dataset terimpor saat ini: **920.674 nopol unik**.

---

## 8. Important Files

| Path File | Fungsi Utama |
|---|---|
| `src/lib/tax-calculator.ts` | Fungsi inti `calculateTax` untuk seluruh perhitungan pajak & sanksi. |
| `src/types/tax.ts` | Kontrak tipe data TypeScript untuk input/output perhitungan, data kendaraan, dan bobot. |
| `src/lib/api.ts` | Fungsi client `fetchVehicleByNopol` yang memanggil Pages Functions dengan abort signal. |
| `functions/api/njkb/[nopol].ts` | Serverless Pages Function yang menghubungkan route `/api/njkb/:nopol` ke D1. |
| `src/hooks/use-nopol-lookup.ts` | Custom hook pengelolaan input Nopol, debounce, pembatalan request, dan status loading/found/not_found/error. |
| `src/components/tax-calculator-form.tsx` | Form 4 tahap dengan controlled accordion dan logic reset / auto-expand. |
| `src/components/form-step-accordion.tsx` | Komponen accordion pembungkus setiap tahap form. |
| `src/components/result-summary.tsx` | Kartu ringkasan total bayar, status masa pajak, dan pemicu salin hasil. |
| `src/components/result-breakdown.tsx` | Accordion rincian per kategori biaya (PKB, Opsen, SWDKLLJ, PNBP). |
| `src/components/mobile-result-bar.tsx` | Sticky bar mobile bawah dan modal Drawer rincian penetapan. |
| `src/components/date-picker-field.tsx` | Komponen input tanggal dengan integrasi calendar popup. |
| `src/components/facility-toggle.tsx` | Komponen toggle fasilitas (Gempa, Mutasi Masuk, Tembak RU). |
| `tests/tax-calculator.regression.ts` | Unit test suite memvalidasi rumus terhadap contoh penetapan resmi SE Pergub 54/2026. |
| `schema.sql` | Definisi tabel D1 `vehicle_njkb`. |
| `wrangler.toml` | Konfigurasi Cloudflare Pages dan database ID D1. |
| `vite.config.ts` | Konfigurasi bundler Vite, Tailwind CSS v4, PWA manifest, dan caching strategy. |

---

## 9. Current Status

- **Build**: Berjalan sukses tanpa error (`npm run build`).
- **Tests**: 9 skenario unit test regresi lulus 100% (`npm run test:tax`).
- **Data D1**: Tersinkronisasi dengan 920.674 data kendaraan aktif.
- **PWA**: Siap offline untuk kalkulasi manual, service worker caching aktif, icon manifest valid.
- **Git State**: Branch `main` bersih, terhubung dengan remote `https://github.com/ElwinMusadi/kalkulator-pajak.git`.

---

## 10. Known Issues / Technical Debt / Limitations

1. **Konfigurasi Environment Base URL**:
   - File `.env.local` saat ini mengarah ke `VITE_API_BASE_URL=https://kalkulator.uptdpenda-kupang.web.id`.
   - Untuk pengembangan lokal dengan Pages Functions mock, dev server perlu dijalankan via `npm run pages:dev` (`wrangler pages dev dist --d1 DB`) dan `VITE_API_BASE_URL` dikosongkan agar request mengarah ke relative path `/api/njkb/...`.
2. **Kuota Harian D1 Free Tier**:
   - Free tier Cloudflare D1 memiliki limit penulisan harian 100.000 rows written. Script re-seeding penuh (920k baris) melebihi batas free tier harian jika dijalankan sekaligus tanpa upgrade plan.
3. **Data Offline Terbatas**:
   - Service worker hanya menyimpan cache Nopol yang pernah berhasil diakses secara online (maksimal 300 entri). Seluruh database 920k kendaraan tidak disimpan offline di browser.
4. **Normalisasi String Jenis Kendaraan**:
   - Pencocokan `jenis` kendaraan bergantung pada string persis dari database (`SEPEDA MOTOR`, `MINIBUS`, dll.). Jika ada varian nama lain di data baru, jenis akan menjadi `undefined` dan meminta user memilih jenis manual.

---

## 11. Integration Points for NJKB API NTT

Jika ke depan aplikasi akan diintegrasikan dengan API resmi Samsat/Bapenda NTT (NJKB API NTT):

1. **Titik Integrasi Serverless (Backend Proxy)**:
   - Modifikasi file `functions/api/njkb/[nopol].ts`.
   - Alur integrasi yang disarankan:
     - Pages Function menerima `:nopol`.
     - Melakukan query ke NJKB API NTT eksternal (dengan API key / token otentikasi).
     - Menjadikan Cloudflare D1 sebagai cache sekunder (read-through cache) untuk efisiensi kuota API eksternal.
     - Mengembalikan respons JSON dengan format yang sama persis seperti kontrak saat ini.
2. **Kontrak Data Frontend (Tidak Perlu Mengubah UI)**:
   - Interface `VehicleData` di `src/types/tax.ts` harus tetap dipertahankan:
     ```ts
     interface VehicleData {
       nopol: string;
       nama: string | null;
       jenis: string | null;
       jatuhTempoStnk: string | null;   // format: "YYYY-MM-DD"
       jatuhTempoPajak: string | null;  // format: "YYYY-MM-DD"
       njkb: number;
       njub: number;
       bobot: number;
     }
     ```
   - Selama payload API eksternal di-mapping menjadi struktur `VehicleData` di atas, komponen frontend (`tax-calculator-form.tsx`, `use-nopol-lookup.ts`, dll.) tidak memerlukan perombakan.
3. **Pengelolaan Kredensial**:
   - Simpan Cloudflare Access Service Token di Cloudflare Secrets / Environment Variables Pages melalui `NJKB_ACCESS_CLIENT_ID` dan `NJKB_ACCESS_CLIENT_SECRET`.
   - Gunakan `NJKB_API_BASE_URL=https://api.uptdpenda-kupang.web.id` dan `NJKB_API_TIMEOUT_MS=8000` pada environment backend.
   - Jangan letakkan kredensial API eksternal di frontend (`src/` atau `VITE_*`).

---

## 12. Important Constraints / Do-Not-Break Rules

1. **JANGAN mengubah rumus matematika pajak di `src/lib/tax-calculator.ts`**:
   - Rumus mengikuti hierarki Pergub NTT 54/2026.
   - Tanggal cutoff **5 Januari 2025** wajib dipertahankan untuk membedakan tarif 1.5% (tanpa opsen) dan 1.2% (dengan opsen 66%).
   - Seluruh test di `tests/tax-calculator.regression.ts` wajib `PASS`.
2. **JANGAN menghapus denda SWDKLLJ**:
   - Tax amnesty membebaskan denda PKB dan denda Opsen, tetapi **TIDAK membebaskan denda SWDKLLJ** (sesuai contoh penetapan resmi).
3. **JANGAN merusak perilaku reset Nopol**:
   - Pengubahan satu karakter pada input Nopol wajib mereset seluruh data kendaraan dan hasil perhitungan, namun **Tanggal Pembayaran harus tetap dipertahankan**.
4. **JANGAN membocorkan rahasia ke bundle client**:
   - Segala integrasi backend D1 atau API pihak ketiga wajib lewat Pages Functions di `/functions/api/...`.
5. **JANGAN merusak aturan cache PWA**:
   - File `public/_headers` harus dijaga agar `sw.js` tidak di-cache oleh browser (`no-cache, no-store, must-revalidate`).
