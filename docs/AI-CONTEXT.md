# AI Context Snapshot: Kalkulator Pajak Kendaraan NTT

Dokumen ini berisi rangkuman teknis aplikasi. Pembaruan November dan Oktober 2026 di bawah menjadi acuan untuk perilaku aktif; snapshot September pada bagian berikutnya bersifat historis jika bertentangan.

## Pembaruan aturan pajak — November 2026 (Pergub 64/2026)

Sumber: `docs/Pergub/Pergub 64 Tahun 2026.pdf` dan `docs/Pergub/Daftar Keringanan Pajak (Amnesty) Pergub 64 Tahun 2026.pdf`. Pergub 64/2026 ditetapkan 30 Okt 2026, berlaku **1 Nov – 31 Des 2026**, dan mencabut Pergub 54/2026 (Pasal 11).

- **Aturan dipilih dari tanggal bayar** (`src/lib/pergub.ts`, `resolvePergub`): 1 Sep – 31 Okt 2026 → Pergub 54/2026 (dipertahankan untuk perhitungan mundur), 1 Nov – 31 Des 2026 → Pergub 64/2026. Di luar itu `calculateTax` melempar `RangeError`; form menampilkan peringatan "Di Luar Masa Berlaku" tanpa hasil. Input `pergub` hanya untuk override test/simulasi.
- **Tunggakan (Pasal 8)**: pokok PKB tunggakan dihapus 100% untuk semua wilayah, sehingga PKB dan Opsen tunggakan Rp0. DP tahun berjalan 100% bila ada tunggakan (sama dengan Pergub 54).
- **Wilayah gempa**: tidak dibedakan lagi. Toggle dan deteksi otomatis hanya tampil/dipakai untuk tanggal bayar masa Pergub 54; `result.isDomisiliGempa` selalu `false` pada Pergub 64.
- **Payment online (Pasal 6 & 10)**: Bank NTT, PRO NTT, SIGNAL. Diskon pokok PKB tahun berjalan 5% (roda 2–3) / 2% (roda 4+), berlaku juga saat terlambat atau menunggak, dan **dijumlahkan** dengan diskon bayar awal (mis. 20% + 5% = 25%). Persen dihitung sebagai bilangan bulat lalu dibagi 100 agar tidak ada galat float. Toggle `isBayarOnline` hanya tampil pada Pergub 64.
- **Mutasi Masuk (Pasal 7)**: 50% saja; tidak dapat dibayar via payment online (toggle online dinonaktifkan, engine mengabaikan).
- **DP 17,5%, diskon bayar awal 10/15/20% / 10%, denda PKB & Opsen dihapus**: sama dengan Pergub 54.
- **SWDKLLJ** (kebijakan BPAD, bukan isi Pergub): pokok berjalan dan pokok tunggakan dipungut; denda SWDKLLJ masa berjalan dipungut; denda SWDKLLJ masa tunggakan dihapus (`dendaSwdklljTunggakanDihapus`). Engine sejak awal menghitung denda dari jatuh tempo di tahun bayar, sehingga nominalnya tidak berubah.
- **Catatan Pergub 54 (tidak diubah)**: Contoh 6–9 SE Pergub 54 memakai denda SWDKLLJ motor Rp32.000 "> 1 tahun terlambat" (diukur dari jatuh tempo pertama), sedangkan engine memberi denda berdasarkan keterlambatan masa berjalan (mis. Rp24.000 untuk 7 bulan). Selisih hanya untuk perhitungan mundur September–Oktober.
- Field hasil baru: `pergub`, `diskonTunggakan`, `isBayarOnline`, `diskonPaymentOnline`, `dendaSwdklljTunggakanDihapus`. Label aplikasi (header, login, meta, manifest PWA) memakai `PERGUB_TERBARU`.

## Notifikasi Web Push dan pengumuman — November 2026

Admin mengirim pengumuman (mis. perubahan perhitungan) ke perangkat pegawai lewat Web Push PWA; riwayatnya juga tampil di aplikasi untuk perangkat tanpa notifikasi.

- **Server tanpa dependensi** (`server/push/web-push.ts`): VAPID ES256 (RFC 8292) dan enkripsi `aes128gcm` (RFC 8291) dengan WebCrypto; lolos vektor uji RFC 8291 Appendix A. `server/push/store.ts`: validasi, D1, pengiriman per gelombang **40 perangkat** (batas 50 subrequest Pages Functions gratis), 201/202 terkirim, 404/410 langganan dihapus, lainnya dipertahankan. Endpoint langganan hanya untuk push service resmi (FCM, Mozilla, WNS, Apple; https tanpa port/userinfo) agar server tidak dipakai mengirim POST ke host sembarang. Workers types menamai parameter ECDH `$public`; kode memakai `public` standar (diuji di workerd lokal).
- **D1** (`migrations/0005_push_notifications.sql`): `push_subscriptions` (per perangkat, `endpoint` unik, ikut terhapus bersama user; perangkat bersama berpindah ke user yang terakhir mengaktifkan) dan `announcements` (judul ≤ 80, isi ≤ 500 karakter, nama pembuat). Audit `announcement.create`.
- **Endpoint**: `GET /api/push/config` (`{enabled, publicKey}`), `POST`/`DELETE /api/push/subscriptions` (milik sendiri), `GET /api/announcements` (20 terbaru, semua user), `POST /api/admin/announcements` (Admin; simpan + gelombang pertama), `POST /api/admin/announcements/:id/send` (`{after}` = kursor gelombang berikutnya), `DELETE /api/admin/announcements/:id` (Admin; 204, audit `announcement.delete`, 404 bila tidak dikenal). Tanpa kunci VAPID: config `enabled:false`, langganan 503 `PUSH_NOT_CONFIGURED`, pengumuman tetap tersimpan.
- **Env** (Pages, production): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` (`https://kalkulator.uptdpenda-kupang.web.id` atau `mailto:`). Buat dengan `npm run vapid:generate`. Lokal: `.dev.vars` (diabaikan git). Mengganti pasangan kunci membuat semua perangkat harus mengaktifkan ulang.
- **Service worker**: `public/sw-push.js` dimuat lewat `workbox.importScripts` (seperti `sw-cleanup.js`, `no-cache` di `_headers`): menampilkan notifikasi (ikon PWA, `tag` per pengumuman) dan saat diklik memfokuskan aplikasi yang terbuka (pesan `kp:buka-pengumuman`) atau membuka `/?pengumuman=1`.
- **UI** (`src/components/notification-center.tsx`, `src/lib/push.ts`): tombol lonceng di header (titik emas = pengumuman belum dibaca, per user di `localStorage`), dialog berisi status notifikasi perangkat (Aktifkan/Matikan, izin diblokir, server belum aktif), formulir *Tulis pengumuman* khusus Admin, dan riwayat (Admin: tombol hapus per pengumuman dengan konfirmasi; notifikasi yang sudah tampil di perangkat tidak ikut terhapus). Logout Admin mematikan notifikasi perangkat itu lebih dulu (maks. 3 detik).
- **Modal "Info Terbaru"** (`OpeningModal` di `notification-center.tsx`): modal besar di tengah berisi versi baru, pengumuman belum dibaca (maks. 3 tampil + tautan ke lonceng), dan ajakan notifikasi. Tampil:
  - **Versi baru = pembaruan wajib.** Kapan pun versi baru terdeteksi setelah login, modal tampil tanpa tombol tutup, Esc, klik di luar, atau "Nanti"; satu-satunya aksi *Perbarui sekarang* (nonaktif saat offline). Dialog lonceng ditutup agar tidak menghalangi. Kartu `PwaUpdateNotice` hanya untuk halaman login/pemeriksaan sesi (juga tanpa "Nanti") dan disembunyikan selama provider terpasang (`src/lib/update-notice-coordination.ts`, `handledByApp`).
  - **Pengumuman — untuk semua user, tanpa perlu mengaktifkan notifikasi.** Web Push (notifikasi saat aplikasi tertutup) hanya sampai ke perangkat yang mengaktifkannya; modal ini tidak bergantung pada push. Tampil saat aplikasi dibuka (menunggu 3 detik agar versi baru yang cepat terdeteksi tampil sekaligus), saat push baru tiba ketika aplikasi terbuka (`kp:pengumuman-baru`), saat aplikasi kembali ke depan dan riwayat dimuat ulang (≥ 1 menit), saat pemeriksaan berkala tiap **5 menit** selama aplikasi tampil di layar (untuk perangkat tanpa push), dan saat notifikasi diklik (`kp:buka-pengumuman` atau `/?pengumuman=1`; bila pengumuman sudah terbaca, yang dibuka dialog lonceng). Jadi setiap pengumuman Admin sampai ke semua user lewat Web Push (bila aktif) **dan** modal ini. Daftar di modal mengikuti data terbaru (pengumuman yang dihapus Admin ikut hilang; modal yang tinggal kosong tertutup sendiri); menutup modal atau *Perbarui sekarang* menandai pengumumannya terbaca. Dialog lonceng yang terbuka mencegah modal pengumuman (pengumuman sudah terlihat di sana).
  - **Ajakan notifikasi** (`notificationPromptKind`), saat modal dibuka: tombol *Aktifkan notifikasi* hanya bila server siap push, perangkat belum aktif, dan izin masih `default` (izin `denied` tidak bisa diminta ulang dari aplikasi); di iPhone/iPad Safari berupa langkah *Tambah ke Layar Utama*. *Nanti saja* menunda ajakan **3 hari** (`localStorage` `kp:ajakan-notifikasi-sampai`).
- **Dukungan perangkat**: Android (Chrome, Samsung Internet, Firefox) dan desktop (Chrome, Edge, Firefox) di peramban maupun terpasang. **iPhone/iPad hanya iOS/iPadOS 16.4+ dan hanya bila dibuka dari ikon Layar Utama** (Safari → Bagikan → Tambah ke Layar Utama); dialog menjelaskannya. Browser pane Claude Desktop memblokir izin notifikasi, jadi uji langganan sungguhan di Chrome/ponsel.
- **Tes**: `npm run test:push` (vektor RFC, dekripsi sisi perangkat, JWT VAPID, hasil per status, deteksi dukungan, ajakan notifikasi dan syarat modal pembuka, endpoint dengan D1 Miniflare: validasi host, CSRF, perangkat bersama, hak Admin, gelombang 40 + 5, langganan 410 dihapus, user nonaktif dilewati, hapus pengumuman).

**Penerapan produksi (urut):** (1) `npx wrangler d1 migrations apply kalkulator-pajak-db --remote` untuk 0005; (2) pasang `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` di Cloudflare Pages production; (3) deploy kode; (4) di setiap perangkat buka lonceng → *Aktifkan notifikasi* → izinkan.

## Pembaruan SWDKLLJ per golongan — November 2026

- Pokok dan denda SWDKLLJ mengikuti golongan Jasa Raharja (A, C1, C2, DP, EP, F), bukan lagi hanya motor/mobil. Golongan ditentukan jenis kendaraan dan, untuk sepeda motor serta mobil barang, isi silinder (CC). Rincian di §6.F.
- Form punya isian **Isi Silinder (CC)** di tahap Dasar Pengenaan, terisi otomatis dari `vehicle.engine_capacity_cc` dan wajib untuk sepeda motor, pick up, light truck, dan truck. Mapper menerima bilangan bulat 1–50.000 (number atau string angka); nilai lain menjadi `null` tanpa menggagalkan lookup.
- PINTU (`D:\Herd\portal-uptdkotakupang`) memakai salinan mesin ini (D-041/D-088). Perubahan ini menambah `src/lib/swdkllj.ts` dan input `isiSilinder`, jadi salinan PINTU perlu disalin ulang dan form PINTU perlu isian CC.

## Pembaruan integrasi — Oktober 2026

- Lookup kendaraan memakai satu sumber: API Data Potensi NTT, `GET /api/v1/vehicle/:nopol` pada server API pusat. Browser tetap memanggil Pages Function `/api/njkb/:nopol` dengan sesi pengguna; kredensial Cloudflare Access tidak dikirim ke browser.
- Backend tidak memakai tabel `vehicle_njkb` sebagai fallback. API 404 adalah hasil akhir tidak ditemukan; kegagalan API ditampilkan, bukan diganti data kendaraan lokal yang mungkin usang. Parameter `source` lama diterima hanya untuk kompatibilitas dan tidak memilih sumber lagi.
- NJKB berasal dari `njkb.value`, bobot dari `njkb.weight`, dan **NJUB dari `potensi.njub`**. NJUB nol valid; nominal yang dikirim tetapi rusak tidak boleh diam-diam dianggap nol. Dasar pengenaan tetap `(NJKB + NJUB) × bobot`, dengan seluruh kebijakan kalkulator yang sudah berlaku.
- Warna plat dari `registration.plate_color` (cadangan `vehicle.plate_color`), UPT asal dari `administrative.origin_upt`, waktu sinkronisasi dari `potensi.synced_at`. Dataset merupakan salinan potensi tersinkronisasi, bukan lookup BPAD real-time.
- Data pemilik sensitif (NIK, alamat lengkap, nomor rangka/mesin) tidak diteruskan ke browser. Hanya nama dan metadata yang diperlukan kalkulator dipetakan melalui allowlist.
- Otomatisasi gempa memakai NOPOL `EB` diikuti angka + UPT asal yang cocok tepat dengan Sikka, Ende, Nagekeo, Ngada, Manggarai, Manggarai Timur, atau Manggarai Barat. Dokumen Nodis menyebut **domisili**; UPT asal hanya petunjuk sehingga petugas tetap harus dapat mengoreksi toggle. Nama kecamatan/kelurahan/alamat tidak dipakai untuk menebak kabupaten. Wilayah tidak dikenal tetap meminta pemeriksaan manual. Perubahan manual bertahan selama pengeditan transaksi; lookup NOPOL baru mengevaluasi kembali.
- Izin lookup aktif adalah `vehicle_lookup.api`; pilihan sumber dan izin D1/settings lama tidak lagi ditawarkan. Migration `0004` memindahkan izin lookup D1 ke API tanpa memberikan izin kalkulator baru. User, sesi, dan hak akses lain dipertahankan.
- Binding D1 aplikasi **tetap diperlukan** untuk autentikasi, sesi, hak akses, dan audit. Tabel kendaraan lama tidak dihapus; seed kendaraan lokal bukan bagian alur lookup aktif.
- Aplikasi wajib online. Respons `/api/*` memakai `no-store`; service worker tidak menyimpan lookup kendaraan. PWA menggunakan auto-update dan menghapus cache kendaraan lama.
- Migration `0004` aman dijalankan ulang, tetapi menghapus pembedaan izin D1/API serta izin Settings lama. **Sebelum production, cadangkan `user_permissions` atau ekspor D1 secara aman.** Jika rollback ke kode lama diperlukan, mengembalikan kode saja tidak mengembalikan izin lama; pulihkan izin dari cadangan yang sesuai, bukan memberi akses baru ke semua user. Hindari menerapkan 0004 sebelum masih diperlukannya kode lama yang mewajibkan izin gabungan D1+API.
- Perubahan kode/migration lokal tidak berarti sudah di-deploy atau diterapkan di production. Periksa Git dan `d1_migrations` untuk status aktual.

---

## 1. Project Overview

- **Nama Project**: `kalkulator-pajak`
- **Tujuan**: Aplikasi web kalkulator Pajak Kendaraan Bermotor (PKB), Opsen PKB, SWDKLLJ, dan PNBP berdasarkan **Peraturan Gubernur Nusa Tenggara Timur Nomor 64 Tahun 2026** (1 Nov – 31 Des 2026). Pergub Nomor 54 Tahun 2026 beserta Surat Edaran Pedoman Pelaksanaan Nomor `900.1.13.1/2741/BPAD2.1` dipertahankan untuk tanggal bayar 1 Sep – 31 Okt 2026.
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
│   │   ├── pwa-update-notice.tsx       # Kartu versi baru di halaman login (setelah login: modal Info Terbaru)
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
│   └── tax-calculator.regression.ts    # Test suite regresi validasi Pergub 54/2026 & 64/2026
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

> Bagian ini menjelaskan aturan Pergub 54/2026. Untuk tanggal bayar 1 Nov – 31 Des 2026 berlaku Pergub 64/2026 dengan perbedaan yang dirangkum di "Pembaruan aturan pajak — November 2026" di atas (tunggakan dihapus 100%, tanpa wilayah gempa, diskon payment online).

Implementasi berada di `src/lib/tax-calculator.ts` melalui fungsi murni `calculateTax(input: TaxCalculatorInput): TaxCalculationResult`; parameter per Pergub ada di `src/lib/pergub.ts`.

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
- **Per golongan Jasa Raharja** (Tarip Denda SWDKLLJ per 1 Juni 2017, `src/lib/swdkllj.ts`). Pokok = SW + KD/sertifikat `Rp3.000`; denda per keterlambatan masa berjalan ≤ 3 / 4–6 / 7–9 / > 9 bulan:

  | Golongan | Kendaraan di kalkulator | Pokok | Denda |
  |---|---|---|---|
  | A | Sepeda motor ≤ 50 cc (SW bebas) | `Rp3.000` | – |
  | C1 | Sepeda motor 51–250 cc | `Rp35.000` | 8.000 / 16.000 / 24.000 / 32.000 |
  | C2 | Sepeda motor > 250 cc | `Rp83.000` | 20.000 / 40.000 / 60.000 / 80.000 |
  | DP | Minibus, sedan, jeep; pick up, light truck, truck ≤ 2.400 cc | `Rp143.000` | 35.000 / 70.000 / 100.000 / 100.000 |
  | EP | Microbus (bukan angkutan umum) | `Rp153.000` | 37.500 / 75.000 / 100.000 / 100.000 |
  | F | Pick up, light truck, truck > 2.400 cc | `Rp163.000` | 40.000 / 80.000 / 100.000 / 100.000 |

  Angkutan umum (DU, EU; plat kuning) dan alat berat (B) tidak dihitung kalkulator.
- **Isi silinder (CC)** menentukan golongan sepeda motor dan mobil barang (pick up, light truck, truck). CC diambil dari `vehicle.engine_capacity_cc` API (`VehicleData.isiSilinder`) dan **wajib diisi manual** di form bila API tidak memberikannya; tanpa CC form tidak menghitung. `calculateTax` tanpa CC (pemanggil lain) memakai golongan bawaan: motor C1, pick up dan light truck DP, truck F.
- Pokok tunggakan: `jumlah_tahun_tunggakan * pokok_golongan`. Hasil memuat `golonganSwdkllj`.
- **Denda SWDKLLJ masa berjalan**: **TETAP DIPUNGUT** (tidak dihapus oleh Tax Amnesty, merujuk contoh resmi Lampiran SE). Pada Pergub 64 denda SWDKLLJ masa tunggakan dihapus.

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
| `src/lib/pergub.ts` | Parameter dan masa berlaku per Pergub (54/2026, 64/2026); `resolvePergub` memilih aturan dari tanggal bayar. |
| `tests/tax-calculator.regression.ts` | Unit test suite memvalidasi rumus terhadap contoh penetapan resmi SE Pergub 54/2026 dan ketentuan Pergub 64/2026. |
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
   - Satu-satunya kredensial: kunci API Data Potensi (`ptn_…`, dibuat di https://potensi.uptdpenda-kupang.web.id/#kunci), disimpan sebagai secret Pages `POTENSI_API_KEY` dan dikirim sebagai `Authorization: Bearer`. Tanpa kunci, lookup mengembalikan `NJKB_CONFIG_ERROR` tanpa memanggil API.
   - Sejak 2026-10-24 Cloudflare Access dilepas dari `api.uptdpenda-kupang.web.id` (Fase 5). Header `CF-Access-Client-*` dan env `VEHICLE_ACCESS_*` / `NJKB_ACCESS_*` / `CF_ACCESS_*` tidak dipakai lagi; hapus secret lamanya dari Pages.
   - Gunakan `NJKB_API_BASE_URL=https://api.uptdpenda-kupang.web.id` dan `NJKB_API_TIMEOUT_MS=8000` pada environment backend.
   - Jangan letakkan kredensial API eksternal di frontend (`src/` atau `VITE_*`).

---

## 12. Important Constraints / Do-Not-Break Rules

1. **JANGAN mengubah rumus matematika pajak di `src/lib/tax-calculator.ts` / `src/lib/pergub.ts` tanpa dasar Pergub**:
   - Rumus mengikuti Pergub NTT 64/2026 (1 Nov – 31 Des 2026) dan Pergub NTT 54/2026 (1 Sep – 31 Okt 2026), dipilih dari tanggal bayar. Pergub baru ditambahkan sebagai entri `PERGUB_RULES`, bukan dengan menimpa aturan lama.
   - Tanggal cutoff **5 Januari 2025** wajib dipertahankan untuk membedakan tarif 1.5% (tanpa opsen) dan 1.2% (dengan opsen 66%).
   - Seluruh test di `tests/tax-calculator.regression.ts` wajib `PASS`.
2. **JANGAN menghapus denda SWDKLLJ masa berjalan**:
   - Tax amnesty membebaskan denda PKB dan denda Opsen, tetapi **TIDAK membebaskan denda SWDKLLJ masa berjalan** (sesuai contoh penetapan resmi). Pada Pergub 64 hanya denda SWDKLLJ masa tunggakan yang dihapus; pokok SWDKLLJ tunggakan tetap dipungut.
3. **JANGAN merusak perilaku reset Nopol**:
   - Pengubahan satu karakter pada input Nopol wajib mereset seluruh data kendaraan dan hasil perhitungan, namun **Tanggal Pembayaran harus tetap dipertahankan**.
4. **JANGAN membocorkan rahasia ke bundle client**:
   - Segala integrasi backend D1 atau API pihak ketiga wajib lewat Pages Functions di `/functions/api/...`.
5. **JANGAN merusak aturan cache PWA**:
   - File `public/_headers` harus dijaga agar `sw.js` tidak di-cache oleh browser (`no-cache, no-store, must-revalidate`).
