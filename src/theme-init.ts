// Diimpor PERTAMA oleh main.tsx: menerapkan kelas tema (.light/.dark) dan
// color-scheme pada <html> sekali, sinkron, sebelum React render. Karena ini
// modul (dieksekusi setelah HTML/CSS awal), pengguna yang memilih Gelap masih
// bisa melihat kilatan Terang singkat sebelum bundle dievaluasi; default Terang
// tidak terpengaruh. Script inline di <head> sengaja tidak dipakai (CSP).
import { initTheme } from "./lib/theme"

initTheme()
