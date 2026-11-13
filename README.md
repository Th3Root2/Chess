# CHESS AI — Refined (UI/UX)

Versi ini menyempurnakan **tampilan dan pengalaman pakai**; mesin catur, AI bot, pembelajaran adaptif, IndexedDB, perekaman,
version manager, dashboard, dan Grandmaster Assistant **tidak diubah logikanya** (penjelasan fitur ada di bagian bawah).

## Perbaikan ukuran papan (akar masalah)
Gejala: kotak kosong di baris 3–6 tampak lebih pendek. Terukur pada versi lama (390 px): tinggi baris = 67,3 / 67,3 / **26,2 / 26,2 / 26,2 / 26,2** / 67,3 / 67,3 px,
sedangkan lebar kolom seragam 46,75 px.
Penyebab: grid hanya mendefinisikan kolom (`repeat(8,1fr)`) dan **tidak mendefinisikan `grid-template-rows`**. Baris implicit berukuran `auto`, sehingga tingginya
mengikuti isi (baris berbidak lebih tinggi daripada baris kosong). `aspect-ratio` hanya memaksa total tinggi papan tetap persegi, bukan tinggi tiap baris —
itulah mengapa papan tampak persegi tetapi kotaknya tidak.
Perbaikan: kolom **dan** baris `repeat(8, minmax(0,1fr))`, `min-width/min-height:0` + `overflow:hidden` pada setiap kotak, tanpa padding/border pada kotak,
dan semua efek (last move, seleksi, check, titik legal, outline Cheat Mode) memakai `box-shadow inset`/`outline`/pseudo-elemen absolut yang tidak memengaruhi layout.
Hasil terukur: 64 kotak identik (selisih < 0,05 px) di 8 ukuran layar dan 8 kondisi (lihat Pengujian).

## Arah desain
- Identitas: papan slate-biru + **satu aksen amber**; warna semantik hanya hijau (rekomendasi/baik) dan merah (ancaman/bahaya). Pewarnaan papan mudah diganti lewat variabel
  `--sq-l` dan `--sq-d` di `css/style.css` (mis. kembali ke cokelat `#f0d9b5` / `#b58863`).
- Tanpa kartu pembungkus: pemisahan memakai garis tipis; statistik berupa baris angka besar. Radius hanya 3 px; tanpa shadow, tanpa glassmorphism.
- Hierarki: papan dominan → status giliran/hasil tepat di atas papan → aksi utama (New Game, Restart, Undo, Resign) tepat di bawah papan → panel samping
  (pengaturan, riwayat langkah, Grandmaster). Di Cheat Mode: eval besar → langkah terbaik → tabel alternatif → detail.
- Navigasi: tab atas pada tablet/desktop; **tab bawah** pada ponsel (mudah dijangkau ibu jari). Papan menempel (sticky) di layout dua kolom agar tetap terlihat saat membaca analisis.
- Penanda baru yang fungsional: kotak giliran (putih/hitam), raja yang di-skak **dan di-skakmat** ditandai merah, panah Cheat Mode dengan kontur gelap agar terbaca di kotak terang maupun gelap.

## Tipografi
Skala 13 / 14 / 16 / 18 / 22 / 28 px, hanya dua bobot (400 dan 600), tidak ada teks di bawah 13 px (termasuk koordinat papan), tanpa label huruf kapital,
angka tabular untuk eval/statistik/riwayat langkah, monospace hanya untuk UCI dan PV. Kontras seluruh teks ≥ 4,5:1 (teks besar ≥ 3:1).

## Tombol & kontrol
Satu sistem untuk semua: tinggi minimum **44 px**, state hover / active / focus-visible (cincin amber) / disabled, tombol toggle memakai `aria-pressed`,
primer (amber), sekunder, bahaya (outline merah). Fungsi tombol tidak diubah.

## Responsive
Ponsel (≥ 360 px): papan selebar layar, tab bawah, panel tersusun vertikal. Ponsel lanskap, tablet lanskap, dan desktop: papan kiri (ukuran mengikuti tinggi layar),
panel kanan. Tablet potret: kolom tunggal maksimum 680 px. Tidak ada overflow horizontal pada semua halaman di semua ukuran yang diuji.

## File yang dimodifikasi
- `css/style.css` — ditulis ulang (sistem desain + perbaikan papan)
- `index.html` — struktur ulang (status di atas papan, aksi di bawah papan, panel samping); semua `id` dipertahankan
- `js/app.js` — hanya presentasi: atribut `data-turn`, penandaan raja skakmat, markup statistik/modal promosi
- `js/dashboard.js`, `js/gm-ui.js` — hanya presentasi (kelas statistik, warna/kontur panah, `aria-pressed`)
- `tests/ui-layout.js` — baru: uji konsistensi papan, overflow, font, kontras, area sentuh
- `tests/ui-gm.js` — penyesuaian selector panah (kini dua garis per panah: kontur + isi)
- tidak berubah: `chess-engine.js`, `ai-*.js`, `database.js`, `match-recorder.js`, `grandmaster.js`, `workers/*`

## Pengujian yang benar-benar dijalankan (Chromium headless, Playwright)
- `node tests/ui-layout.js <url>` pada 8 viewport (360×640, 390×844, 412×915, 844×390, 768×1024, 1024×768, 1280×800, 1920×1080), tiap viewport: ukuran 64 kotak
  pada kondisi awal, bidak terpilih + indikator legal, setelah langkah + last move, check, checkmate, draw (threefold), overlay Cheat Mode, dan setelah resize;
  lalu audit tab Game/Dashboard/Versi AI: overflow, teks terpotong, font ≥ 13 px, kontras, area sentuh ≥ 44 px, error JS.
- Fitur lama diuji ulang: `perft.js`, `search.js`, `learning.js`, `gm.js` (Node) serta `ui-smoke.js` dan `ui-gm.js` (via `http://` dan `file://`).
- **Belum diuji:** perangkat Android sungguhan/WebView, Firefox, Edge, Safari. Pengujian ponsel memakai emulasi viewport + sentuhan di Chromium.
  Tampilan glyph bidak bergantung font sistem. Screenshot referensi yang Anda kirim adalah tangkapan aplikasi lama sendiri (dipakai untuk memverifikasi bug dan keterbacaan);
  tidak ada referensi produk lain yang dilampirkan, sehingga arah desain disusun dari prinsip pada brief.

---
# CHESS AI — Adaptive Learning Engine + GRANDMASTER ASSISTANT

Game catur lokal (HTML5 + CSS3 + Vanilla JavaScript) dengan AI yang merekam pertandingan, menganalisisnya, dan
meningkatkan basis pengetahuannya lewat **pembaruan versi yang dikendalikan pengguna**.
Tanpa backend, tanpa Node/npm, tanpa library eksternal (mesin catur ditulis sendiri; tidak memakai chess.js/CDN).

## Menjalankan
- **Cara termudah:** ekstrak ZIP, buka `index.html` di Chrome/Firefox/Edge. Berfungsi dari `file://`.
- **Disarankan:** jalankan server statis lokal agar AI memakai Web Worker (UI tidak membeku saat bot berpikir):
  `python3 -m http.server 8000` lalu buka `http://localhost:8000`.
  Dari `file://` Chrome memblokir Worker, sehingga aplikasi otomatis memakai fallback di thread utama
  (bot tetap jalan, UI bisa terhenti sesaat pada level Hard/Expert; waktu berpikir dibatasi).
- Android: host di server statis atau buka lewat Chrome; IndexedDB menyimpan data di perangkat.


## GRANDMASTER ASSISTANT (CHEAT MODE)
Asisten analisis untuk membantu Anda mengalahkan bot **di permainan lokal ini**. Aktifkan lewat tombol **Enable Cheat Mode**
di panel samping. Semua analisis berjalan lokal; tidak ada data keluar dari perangkat. (Jangan dipakai di permainan online/turnamen —
itu curang terhadap lawan manusia.)

**Kontrol:** Analyze Position · Stop Analysis · Show Best Move · Show Alternative Moves · Next Best Move · Apply Best Move ·
Periksa langkah terakhir. Langkah **tidak pernah dimainkan otomatis**; hanya tombol *Apply Best Move* yang memainkannya.
Opsi "Analisis otomatis saat giliran saya" (default mati) hanya menjalankan analisis, bukan langkah.

**Yang ditampilkan** (di papan utama, tidak ada papan kedua): panah hijau = langkah terbaik (emas jika Anda memilih langkah #2/#3 dengan
*Next Best Move*), panah biru + kotak putus-putus = alternatif, cincin merah = bidak Anda yang terancam, cincin ungu = raja lawan jika ada
skakmat paksa, panah merah putus-putus + cincin raja berkedip = lawan mengancam skakmat 1 langkah.
Panel: langkah terbaik (SAN + UCI), Multi-PV hingga 5 baris dengan eval (centipawan atau M#), selisih dari langkah terbaik, perkiraan
peluang menang, PV dalam SAN, rincian evaluasi (material, king safety, positional, tactical), ancaman, peluang taktis
(skakmat, tangkapan yang menang materi, skak, garpu, promosi), penilaian langkah terakhir (good / inaccuracy / mistake / blunder),
dan indikator stabilitas langkah terbaik antar kedalaman.

**Engine — jujur soal Stockfish:** proyek ini **tidak membundel dan tidak memakai Stockfish**. Lingkungan pembuatan tidak punya akses
internet, jadi Stockfish.js/WASM tidak dapat diunduh, diuji, atau diverifikasi lisensinya. Asisten memakai **engine JavaScript bawaan CHESS AI**
(negamax + alpha-beta, iterative deepening, quiescence search, transposition table ber-batas, Multi-PV) — engine yang sama dengan bot,
tetapi dengan kedalaman/waktu/Multi-PV yang bisa Anda naikkan, sehingga biasanya lebih kuat daripada bot pada level yang sama.
Itu **bukan jaminan menang** dan jauh di bawah Stockfish. UI menuliskan "bukan Stockfish" secara eksplisit.
Jika Anda ingin Stockfish: lisensinya GPLv3 (kode sumber wajib disertakan bila didistribusikan); build WASM resmi dan sumbernya ada di
github.com/official-stockfish/Stockfish dan paket `stockfish` — integrasinya belum dibuat di sini (butuh adapter UCI di `workers/analysis-worker.js`).
Kedalaman lebih tinggi tidak selalu berarti langkah lebih baik, karena itu asisten menampilkan apakah langkah terbaik stabil di 3 kedalaman terakhir.

**Performa & RAM:** analisis di Web Worker terpisah (`workers/analysis-worker.js`) yang di-`terminate()` saat Stop, saat posisi berubah,
atau saat New Game/Undo, sehingga RAM transposition table langsung dibebaskan. Pengaturan: depth maks, waktu, Multi-PV, batas hash (jumlah entri TT);
preset **Cepat (Android)** (depth 8, 2 s, 3 baris, 50 rb entri) dipilih otomatis di Android/perangkat ≤4 GB. Dari `file://` Worker diblokir Chrome →
analisis berjalan di thread utama per-kedalaman (UI bisa terhenti sesaat); gunakan server statis untuk pengalaman terbaik.

**Analisis gaya bot:** dari pertandingan vs bot yang tersimpan: pembukaan & langkah pertama bot, persentase tangkapan/skak, Menteri keluar dini,
pola rokade, frekuensi blunder (dari analisis tersimpan + penilaian live langkah bot), dan balasan yang pernah dimainkan bot setelah langkah yang
direkomendasikan. Ini **informasi tambahan saja**; rekomendasi tetap dihitung engine dari posisi saat ini. Cheat Mode **tidak menulis** ke
pengetahuan/versi AI/analisis pembelajaran; satu-satunya data baru adalah penghitung live di meta `gmBotLive` dan flag `cheatUsed` pada
catatan pertandingan yang selesai (pertandingan yang memakai Cheat Mode tetap masuk antrean pembelajaran seperti biasa — langkah Anda dinilai oleh engine,
bukan dianggap benar otomatis).

## Pengujian Grandmaster Assistant
- `node tests/gm.js`: pada 120 posisi acak, semua baris Multi-PV legal, jumlah baris benar, terurut, PV legal, papan tidak berubah; mate-in-1 dan taktik
  ditemukan; stalemate/mate → tanpa baris; deteksi ancaman, peluang (skakmat, tangkapan, garpu), ancaman skakmat lawan, blunder; batas TT (20 rb entri tidak terlampaui).
- `node tests/ui-gm.js <url>` (Playwright/Chromium, 390×800): panah & highlight di papan utama, 3 baris Multi-PV, Next/Show/Apply/Stop, tidak ada langkah otomatis,
  analisis dihentikan saat posisi berubah & New Game, ancaman skakmat lawan, blunder 3...Nf6 terdeteksi, Qxf7# ditemukan dan dimainkan, langkah bot dinilai otomatis,
  versi AI & data analisis pembelajaran **tidak berubah**, serta uji performa dengan **CPU diperlambat 4×**: analisis preset cepat selesai ±2,3 s dan jeda UI terbesar 161–246 ms.
  Lulus via `http://` (Worker) dan `file://` (fallback).
- Fitur lama diuji ulang (perft, search, learning, ui-smoke): semuanya lulus.
- **Belum diuji** di perangkat berRAM terbatas sungguhan; yang diuji hanya emulasi CPU 4× dan pembatasan entri TT. Memori worker tidak diukur langsung.

## Fitur
- Catur lengkap: legal move, skak/skakmat, stalemate, rokade, en passant, promosi, threefold repetition, 50-move rule,
  materi tidak cukup. FEN & SAN. Klik-untuk-pindah dan drag & drop, highlight langkah legal/terakhir/skak, animasi, koordinat.
- Mode: Player vs Player (lokal) dan Player vs Bot (pilih warna: Putih/Hitam/Acak), Restart, Undo, Resign, New Game, Move History.
- AI: negamax + alpha-beta, iterative deepening, move ordering (TT move, MVV-LVA, killer, history), quiescence search,
  transposition table (Zobrist), check extension, late move reduction. Evaluasi: material, piece-square, kontrol pusat,
  pengembangan, keamanan raja, struktur pion, mobilitas, bishop pair, passed pawn, aktivitas benteng.
- Level: Easy/Medium/Hard/Expert = **engine dan basis pengetahuan yang sama**, hanya kedalaman, waktu, dan noise berbeda.
- Perekaman otomatis semua pertandingan (PvP dan semua level bot) ke IndexedDB: ID, tanggal, mode, warna, level, langkah, SAN,
  FEN tiap posisi, hasil, durasi. Tidak ada data yang dikirim ke server.
- Pembelajaran (3 lapisan terpisah): data mentah (`matches`) → data teranalisis (`analysis`) → pengetahuan AI (di dalam tiap versi).
- Versi AI: Collecting Data → Update Available → UPDATE AI (manual, ada konfirmasi) → kandidat diuji lawan versi aktif →
  Anda memutuskan mengaktifkan atau tidak → New AI Version. Rollback ke versi lama tersedia. Data lama tidak pernah dihapus.
- Halaman **Dashboard** (statistik + grafik bar) dan **Versi AI** (versi aktif/sebelumnya/kandidat, riwayat, perbandingan performa).

## Cara kerja pembelajaran (jujur)
Ini **bukan machine learning / neural network**. Ini statistik + evaluasi heuristik:
1. Tiap posisi pertandingan dievaluasi engine (kedalaman 3, ±100 ms/posisi). Selisih skor sebelum/sesudah langkah
   menentukan kualitas: Good (≤30 cp), Inaccuracy (≤80), Mistake (≤200), Blunder (>200).
   Langkah pemain **tidak** dianggap benar otomatis. Posisi yang sudah menang/kalah telak (>900 cp) tidak dipelajari.
2. Pengetahuan menyimpan per posisi: berapa kali sebuah langkah tergolong baik/buruk, dan hasil game sebagai faktor kecil.
   Juga *opening memory* (6 ply pertama) dan pola langkah berulang.
3. Saat bot memilih langkah, pengetahuan hanya menjadi **bonus/penalti kecil di akar pencarian** (maks +30 / −120 cp).
   Evaluasi engine tetap dominan, sehingga data buruk tidak bisa membuat bot melewatkan skakmat atau memberi Menteri gratis.
4. Kandidat versi baru lolos hanya bila: 100% langkah legal, skor taktik dan penghindaran blunder tidak lebih buruk dari versi aktif,
   dan skor melawan versi aktif ≥ 45% (6 game, kedalaman 2 — sampel kecil, jadi ini uji *non-regresi*, bukan bukti peningkatan kekuatan).
   Jika gagal: kandidat berstatus `rejected`, versi aktif tidak berubah.

Penambahan data tidak otomatis membuat AI lebih kuat; efek pembelajaran umumnya kecil dan terlihat terutama pada
posisi/pembukaan yang sering Anda mainkan.

## Struktur
```
index.html, css/style.css
js/chess-engine.js        aturan catur, FEN/SAN, status game
js/ai-evaluation.js       fungsi evaluasi
js/ai-engine.js           pencarian + tingkat kesulitan
js/ai-learning.js         analisis, statistik, opening memory, bonus akar
js/ai-version-manager.js  versi, pengujian kandidat, aktivasi, rollback
js/match-recorder.js      perekaman pertandingan
js/database.js            IndexedDB (fallback memori bila tak tersedia)
js/dashboard.js           dashboard
js/grandmaster.js         ancaman, peluang taktis, breakdown, penilaian langkah, profil bot
js/gm-ui.js               UI Cheat Mode (panel, panah, kontrol)
js/app.js                 UI & kontrol game
workers/ai-worker.js      pencarian bot di Web Worker
workers/analysis-worker.js  analisis Multi-PV & penilaian langkah (Grandmaster)
tests/                    perft.js, search.js, learning.js, gm.js (Node); ui-smoke.js, ui-gm.js (Playwright, opsional)
```

## Pengujian yang sudah dijalankan
- `node tests/perft.js` — perft cocok dengan nilai referensi pada 5 posisi standar (termasuk Kiwipete: rokade, en passant, promosi);
  hash Zobrist inkremental = hash penuh.
- `node tests/search.js` — AI menemukan skakmat 1 langkah & taktik dasar; 350 langkah AI dalam partai penuh, 0 ilegal.
- `node tests/learning.js` — alur penuh: rekam → pending → UPDATE AI → kandidat → aktivasi manual → rollback;
  kandidat gagal tidak menggantikan versi aktif; data tidak terhapus (memakai penyimpanan memori karena Node tak punya IndexedDB).
- `node tests/ui-smoke.js <url>` — Chromium headless (viewport 390×800 + sentuhan): klik/gerak, bot membalas, undo, main sebagai Hitam,
  Fool's Mate PvP terdeteksi, data tersimpan di IndexedDB **dan tetap ada setelah reload**, dashboard, UPDATE AI → aktivasi → rollback,
  tanpa error JavaScript. Lulus via `http://` (dengan Web Worker) dan `file://` (fallback tanpa Worker).

## Batasan yang diketahui
- Belum diuji di perangkat Android sungguhan, Android WebView, Firefox, atau Edge; hanya Chromium headless (emulasi viewport ponsel).
- Hanya pertandingan yang **selesai** (termasuk resign) yang direkam; game yang ditinggalkan di tengah jalan tidak disimpan.
- Bidak memakai glyph Unicode (♟); tampilan bergantung font sistem. Jika bidak tampak aneh, ganti font di `css/style.css` (`.pc`).
- Analisis di UPDATE AI berjalan di thread utama (dengan jeda agar UI tetap responsif) dan bisa memakan beberapa menit untuk ratusan game.
- Kekuatan bot: engine JavaScript ringan dengan batas waktu; jauh di bawah Stockfish. Tidak ada buku pembukaan bawaan,
  hanya yang dipelajari dari pertandingan Anda.
- Stockfish tidak disertakan (lihat bagian Grandmaster Assistant).
- Tidak ada penawaran remis manual, jam catur, atau impor PGN.

## Lisensi
MIT — lihat `LICENSE.txt`.
