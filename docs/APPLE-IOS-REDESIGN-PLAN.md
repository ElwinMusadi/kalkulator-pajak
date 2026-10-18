# Implementation Plan — Redesign Apple-inspired Kalkulator Pajak Kendaraan

Status: implementasi visual dan validasi lokal selesai pada branch `feat/apple-ios-redesign`. Review sumber disetujui dan seluruh 12 skenario browser persisten lulus, termasuk Select pada landscape/teks diperbesar. Belum commit, push, merge, atau deployment. Tanggal: 18 Oktober 2026.
Baseline: `main` pada commit `1c8c6d8`. Perubahan pengguna pada `.gitignore` (`docs/figma`) dipertahankan; tidak ada reset, stash, atau penimpaan referensi desain.

## 1. Tujuan dan batas studi

Adaptasi prinsip Apple Human Interface Guidelines untuk aplikasi web/PWA, bukan migrasi ke SwiftUI/UIKit dan bukan replika iOS pixel-perfect. Identitas UPTD Kota Kupang, logo NTT, warna teal, dan domain layanan publik tetap dipertahankan.

Sumber resmi yang dipelajari: Apple Design, Apple Design Resources, HIG Materials, Typography, Layout, Color, Accessibility, Sheets, Text Fields, dan Designing for iOS.

Tautan Figma pengguna dikenali melalui metadata oEmbed sebagai `iOS and iPadOS 27 (Community)`. Halaman/frame `221-56229` tidak dapat diakses (HTTP 403). Pengguna kemudian menyediakan `docs/Figma/iPhone.svg`: atlas 36000×2500, sudah dirender dan diperiksa secara visual pada implementasi. Referensi memperlihatkan grouped background `#F2F2F7`, permukaan putih inset dengan radius sekitar 26 pada kanvas 402, kontrol melingkar 44, dan toolbar kapsul tinggi 62/radius 31. Angka ini menjadi kalibrasi referensi, bukan ukuran wajib untuk web. Efek SVG berlapis, ikon raster base64, dan chrome sistem tidak disalin ke aplikasi. Constraints/variants Figma tetap tidak tersedia dari ekspor SVG. File referensi tetap diabaikan git sesuai perubahan pengguna.

## 2. Arah desain

Konsep: "iOS Utility, Identitas Teal NTT".

- Konten: grouped background netral, kartu/inset grouped sections solid, separator halus, hierarki teks yang tenang.
- Navigasi: navigation bar ringkas, judul jelas, aksi sekunder di menu akun atau toolbar.
- Glass: terbatas pada toolbar dan bar hasil mengambang. Jangan memakai blur pada seluruh form, daftar biaya, atau informasi kendaraan. CSS hanya pendekatan visual Liquid Glass, bukan material native Apple.
- Primary teal dipertahankan. Gradasi dibuat halus pada aksi utama/ringkasan; tidak semua elemen diwarnai.
- Ciri aplikasi tetap plat TNKB dengan warna putih/hitam/merah dan strip PAJAK dd-MM-yyyy | STNK MM-yy.
- Hindari status bar, Dynamic Island, home indicator, logo Apple, biometrik palsu, dan navigasi tab kosong yang menyamar sebagai sistem iOS.

### Token awal — nilai aplikasi, bukan salinan warna dinamis UIKit

| Peran | Light awal | Dark awal |
|---|---|---|
| Grouped background | #F2F2F7 | #111214 |
| Surface/kartu | #FFFFFF | #1C1C1E |
| Label utama | #172522 | #F4F7F6 |
| Label sekunder | #596663 | #ABB7B3 |
| Teal interaktif | #0D6B63 | #65D6C5 |
| Separator | #DDE3E1 | #39413E |

Nilai final harus lulus kontras; label muted dan separator memakai token berbeda. Teks normal minimal 4,5:1, teks besar 3:1; target indikator/fokus dan kontrol 3:1. Warna status disertai teks/ikon.

Typography:
- UI (`--font-sans`): `-apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Perangkat Apple memakai font sistem; Windows/Android/Linux memakai Plus Jakarta Sans (Google Fonts, `display=swap`). `system-ui`/Segoe UI/Roboto tidak boleh berada sebelum Plus Jakarta Sans; Segoe UI/Roboto hanya fallback bila font jaringan gagal. Tanpa deteksi user agent.
- Sistem Apple memakai font sistem yang tersedia di perangkat; jangan bundel font SF Pro atau ekspor SF Symbols untuk web tanpa memastikan lisensinya. Lucide tetap digunakan.
- Nomor polisi (input plat TNKB, `--font-plate`) dan seluruh nominal Rupiah (`.monetary` / `--font-money`): IBM Plex Sans di semua perangkat, figur tabular. Tanggal, bobot, persen, dan hitungan tetap `.numeric` (font UI). Label plat mini dan strip tanggal plat memakai font UI.
- Skala awal CSS: large title 30–34px, title 22–24px, body/input 16–17px, label 14–15px, metadata 12–13px. Native pt tidak dipetakan secara literal ke semua perangkat web.
- Heading, label, dan rupiah memakai kapitalisasi yang konsisten; singkatan resmi tetap uppercase. Tidak memakai tracking kapital berlebihan di seluruh layar.
- Spacing 4/8/12/16/24/32px; kontrol sentuh minimal 44×44 CSS px sebagai target implementasi web. Radius kartu 16–22px; input 10–12px; pill hanya untuk aksi/indikator yang sesuai. Shadow rendah, bukan bayangan tebal pada tiap field.

## 3. Layout adaptif

Breakpoint awal, disesuaikan berdasarkan isi pada pengujian, bukan user-agent:

- Compact <768px: satu kolom, large title di atas; lima kelompok form vertikal. Total dan tombol Rincian pada bar bawah dengan safe-area. Tidak menambah tab bar untuk Petugas yang hanya punya satu tujuan utama.
- Medium 768–1023px: satu kolom lebih lapang, grid field dua kolom bila cukup. Rincian tetap melalui bar/sheet agar form tidak terjepit.
- Regular ≥1024px: form dan inspector hasil berdampingan; inspector sticky, sekitar 360–420px sesuai ruang. Header/toolbar menyusut, tidak menyerupai landing-page hero.
- Lebar konten maksimum sekitar 1280px. Tablet split-screen diperlakukan menurut lebar aktual.
- Visibility inspector, bar mobile, padding bawah konten, dan posisi pill update PWA harus memakai breakpoint yang sama agar hasil tidak hilang atau bertumpuk.

## 4. Perubahan per area

### Header dan navigasi
- Ringkas identitas instansi; logo tetap terlihat tetapi bukan hero dominan.
- Judul Kalkulator Pajak, konteks instansi sebagai subtitle.
- Admin memakai segmented navigation Kalkulator/Kelola User; Petugas tidak menampilkan slot navigasi kosong atau logout.
- Aksi Instal, informasi Sumber Data, dan akun tetap dapat ditemukan. Menu ikon punya label aksesibel dan area sentuh cukup.

### Form
- Pertahankan lima bagian: Kendaraan; Dasar Pengenaan; Masa Pajak; Fasilitas & Biaya Tambahan; Biaya BBN & Mutasi.
- Gunakan inset grouped sections dengan section header dan disclosure, bukan menumpuk kartu berbingkai tebal.
- Nopol tetap berbentuk plat, dengan bingkai lebih tenang; status loading/error/tidak ditemukan tidak menggeser layout secara berlebihan.
- Kartu ditemukan tetap hanya Nama Pemilik, UPT Asal, Sinkronisasi Data. Desktop satu baris; mobile bertumpuk sesuai ruang. Jangan mengembalikan fakta duplikat atau disclaimer yang sudah dihapus pengguna.
- NJKB/NJUB/bobot, input Rupiah, kalender, radio warna plat, serta toggle fasilitas memakai primitive yang sama.
- Label field selalu terlihat; placeholder bukan pengganti label. Field error terhubung melalui aria-describedby dan tidak hanya warna.
- Input Rupiah mempertahankan parser ketat, event native, caret, dan semua validasi. Jangan mengganti formatter saat redesign.

### Hasil
- Nominal total paling menonjol, label Total Bayar rapat dengan nominal, dan tombol Salin tidak memengaruhi jaraknya.
- Pertahankan Pajak Aktif bila >90 hari tanpa tunggakan, badge tarif hanya plat merah, dan keterangan gempa berdasarkan toggle hasil.
- PKB, Opsen, SWDKLLJ, STNK/TNKB, dan BBN/Mutasi berupa grouped rows ringkas dengan disclosure. Singkatan dan kepanjangan satu baris pada ruang normal; saat pembesaran teks aksesibilitas boleh wrap, tidak boleh terpotong.
- Rincian memakai align nominal kanan dan tabular figures; tidak mengubah komponen biaya atau teks salin.
- Mobile memakai sheet Rincian yang sudah ada: grabber jika memang bisa diseret, judul, tombol Tutup, scroll konten, safe area. Desktop memakai inspector, bukan sheet.

### Dialog dan Admin
- Dialog Sumber Data tetap read-only; jangan mengembalikan mode D1 atau fallback lama.
- iPhone: sheet untuk tugas singkat; iPad/desktop: dialog terpusat dengan lebar terbatas. Gunakan Radix/vaul yang sudah ada; jangan menambah framework native-like baru.
- Satu modal aktif per alur. Form user panjang boleh tinggi penuh/scroll, bukan sheet kecil dengan banyak nested dialogs.
- Kelola User: grouped list pada mobile, tabel pada desktop. Reset password, hapus sesi, izin modul, dan konfirmasi hapus dipertahankan.

### Login, PWA, dan state
- Login lebih sederhana: logo, judul, grouped input, tombol primary, error dan petunjuk Admin.
- Pada ukuran teks normal dan viewport acuan, login tetap pas layar tanpa scroll.
- Usulan pengecualian aksesibilitas: jika keyboard/zoom/pembesaran teks membuat konten tidak muat, izinkan scroll vertikal terbatas agar field/error/tombol tetap terjangkau. Ini penyempurnaan aturan no-scroll sebelumnya, bukan perubahan diam-diam; perlu disepakati sebelum diterapkan.
- Empty/loading/offline/403/error/sesi dihapus memakai bahasa dan hierarki yang sama.
- PWA update mempertahankan Perbarui/Nanti, peringatan reset isian, live region, larangan forced reload, dan layer di bawah modal. Instalasi Android/iOS tetap berfungsi.
- Aplikasi tetap wajib online. Tidak membuat cache kendaraan atau login baru.

## 5. Invarian fungsional

Tidak mengubah:
- calculateTax, tarif semua plat, diskon, Opsen, SWDKLLJ, PNBP, biaya bagian 5, atau tanggal cutoff.
- Kontrak API, satu sumber Data Potensi NTT, NJUB, bobot API, sanitasi metadata, dan no-store.
- Auto-gempa EB + UPT terdampak, petunjuk bukan bukti domisili, override manual.
- Nopol baru mereset data/fasilitas/biaya/hasil tetapi mempertahankan tanggal bayar.
- Pengisian manual tidak menghitung sebelum submit valid; lookup lengkap menghitung otomatis; hasil tidak valid dikosongkan.
- Pilihan manual warna plat, gempa, dan biaya tetap bertahan saat tanggal bayar berubah.
- Permission gating di UI dan server, aturan satu sesi Petugas, expiry Admin, refresh sesi, dan penghapusan sesi oleh Admin.
- PWA cache cleanup, deteksi update, dan urutan stacking dialog/notifikasi.

## 6. Tahap implementasi dan file

0. Baseline dan Git: periksa working tree, fetch main, simpan daftar perubahan tanpa reset/clean/stash otomatis. Jika bersih, buat branch `feat/apple-ios-redesign` dari main terbaru. Tidak perlu worktree atau sesi Agent Manager baru. Jangan commit/push/merge/deploy tanpa perintah terpisah.
1. Snapshot UI/state dan hasil perhitungan: login, lookup lengkap, NJUB >0, gempa, manual, error, fees, Admin, PWA update pada mobile/tablet/desktop.
2. Tokens: `src/index.css`; siapkan semantic color/surface/material/type scale. Perubahan manifest/theme-color hanya bila perlu, tanpa mengubah caching.
3. Primitive: `src/components/ui/*`, `date-picker-field.tsx`, `facility-toggle.tsx`, `plate-color-radio-group.tsx`. Pertahankan exports, props, refs, native events, focus, dan Radix semantics.
4. Shell: `App.tsx`, `app-header.tsx`, `mobile-result-bar.tsx`, dialog sumber, komponen instal/update PWA (presentasi saja).
5. Form: JSX/className pada `tax-calculator-form.tsx`, `form-step-accordion.tsx`, `nopol-lookup-status.tsx`. Jangan refactor efek/state yang rumit bersamaan dengan redesign.
6. Hasil: `result-summary.tsx`, `result-breakdown.tsx`, `tax-result-panel.tsx`, `result-empty.tsx`.
7. Login dan Admin: `components/auth/*`, `password-input.tsx`, `components/admin/*`. Perubahan scroll hook hanya jika pengecualian aksesibilitas disepakati.
8. Visual iteration, automated/browser regressions, accessibility audit, review independen, dan laporan akhir. Preview lokal/branch non-production; tidak memakai database production untuk testing.

Pembagian kerja: System Architect mengunci batas perilaku, Frontend Engineer mengerjakan token/komponen dengan kepemilikan file terpisah, Test Engineer membuat regresi UI persisten dan melakukan verifikasi browser, Code Reviewer melakukan quality gate. Backend/Database Engineer hanya dilibatkan jika ada temuan, bukan untuk mengubah backend pada tugas visual ini.

## 7. Pengujian dan acceptance criteria

Perintah final:

```bash
npm run test:vehicle
npm run test:tax
npm run test:auth
npm run test:fees
npm run test:gempa
npm run test:pwa
npm run typecheck
npm run lint
npm run build
```

- Pengujian UI persisten tersedia di `tests/ui-redesign.browser.mjs`, dijalankan dengan `npm run test:ui` setelah server lokal aktif. Harness memakai respons sintetis, menolak request domain eksternal, dan menyimpan screenshot ke folder sementara. Tidak ada dependency baru pada repository; jika `playwright-core` belum terpasang, arahkan `PLAYWRIGHT_CORE_PATH` ke instalasi eksternal, `CHROME_PATH` ke executable browser, dan `UI_BASE_URL` ke alamat preview. Contoh konfigurasi port: `$env:UI_BASE_URL="http://localhost:5173"`. Harness harus gagal jelas bila browser/module tidak tersedia, bukan mengklaim semua test terlewati. Pengujian UI tidak mengakses akun atau database production.
- Browser: Chrome/Edge dan WebKit/Safari; Chromium emulasi iPhone tidak menggantikan Safari sungguhan.
- Viewports: 320, 375/390, 430, 768/820, 1024, 1280, 1440px; landscape 844×390; iPad split-screen; PWA standalone; safe-area dan keyboard terbuka.
- Zoom 200%, teks diperbesar, keyboard-only, VoiceOver pada iPhone, reduced motion, increased contrast, light/dark. Sesuai revisi pengguna, default selalu Light tanpa mengikuti OS. Switch Mode Gelap di navbar tersedia untuk Admin/Petugas, tersimpan lokal pada key `kalkulator-pajak.theme` dan tersinkron antar-tab; nilai storage rusak/tidak tersedia kembali ke Light. Tidak ada perubahan pengaturan akun atau penyimpanan preferensi di backend.
- Web tidak selalu menerima pengaturan transparansi native. Gunakan opaque fallback jika backdrop-filter tidak tersedia atau preferensi terkait terdeteksi; jangan mengandalkan deteksi native yang tidak didukung browser.
- Admin semua modul; Petugas dengan/tanpa lookup; tanpa kalkulator; tanpa Tembak RU/BBN; pencabutan izin saat form terisi.
- Kondisi: gempa auto-on/manual-off, origin tak dikenal, NJUB positif, perubahan NJKB mempertahankan bobot, pergantian jenis, plat merah, Nopol baru, tanggal bayar, fee valid/invalid/paste, status Pajak Aktif, no-arrears gempa.
- PWA: instal, first worker tanpa notice, dua deployment update, Perbarui/Nanti, offline, dialog terbuka, input tidak hilang sebelum update.

Selesai bila hasil perhitungan identik baseline, tidak ada akses baru/terhapus, tidak ada overflow pada ukuran normal maupun aksesibilitas, angka Rupiah dan tombol utama selalu terjangkau, semua modal lolos focus-return/Escape, seluruh suite lulus, dan review independen menyetujui. Klaim pengujian perangkat nyata harus dibedakan dari simulasi.

## 8. Risiko dan keputusan awal

- Komponen form sangat stateful: pisahkan styling dari refactor perilaku.
- Glass mahal pada perangkat lama: maksimal beberapa lapisan kecil, tanpa filter/refraction SVG kompleks. Uji scroll dan fallback solid.
- Font sistem mengubah metrik: uji label Indonesia panjang, angka besar, dan strip tanggal; tidak mengunci semua row menjadi satu baris saat text zoom.
- SVG iPhone dari pengguna sudah diperiksa secara visual; HIG tetap sumber utama. SVG tidak menyertakan constraints/variants Figma, sehingga perilaku komponen web ditetapkan melalui aksesibilitas dan pengujian, bukan ditebak dari path grafis.
- Login mutlak no-scroll vs aksesibilitas merupakan konflik nyata; default usulan adalah tanpa scroll pada kondisi normal dengan escape hatch saat konten tidak muat.
- Tidak perlu migration atau secret/config API baru. Tidak membuat fitur native palsu atau menjanjikan seluruh efek/gestur UIKit tersedia di web.

## Referensi

- https://developer.apple.com/design/
- https://developer.apple.com/design/resources/
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/layout
- https://developer.apple.com/design/human-interface-guidelines/color
- https://developer.apple.com/design/human-interface-guidelines/accessibility
- https://developer.apple.com/design/human-interface-guidelines/sheets
- https://developer.apple.com/design/human-interface-guidelines/text-fields
- https://www.figma.com/design/o1gbBttSSfvsS1t7YgxZjm/iOS-and-iPadOS-27--Community-?node-id=221-56229
