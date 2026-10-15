# TTE Teknik Sipil UTU — Tanda Tangan Elektronik Berbasis QR

Sistem tanda tangan elektronik untuk Ketua Program Studi Teknik Sipil UTU.
Surat PDF diunggah, Kaprodi menyetujui, lalu sistem membubuhkan stempel QR beserta identitas penandatangan.
QR mengarah ke halaman verifikasi publik yang menampilkan keabsahan dan sidik jari (SHA-256) dokumen.

## Isi folder

| Berkas | Fungsi |
|---|---|
| `index.html` | Seluruh tampilan: login, antrean, unggah, arsip, pengaturan stempel, halaman verifikasi |
| `api/index.js` | Satu fungsi serverless Vercel yang terhubung ke Neon PostgreSQL |
| `package.json` | Daftar pustaka server (hanya `@neondatabase/serverless`) |

Tabel database dibuat otomatis saat pertama kali dipakai. Tidak ada langkah build.

## Cara deploy (±15 menit)

1. **Buat database Neon.** Masuk ke neon.tech, buat project baru, lalu salin *connection string* (diawali `postgresql://`).
2. **Unggah ke GitHub.** Buat repository baru, misalnya `ttd-sipil`, lalu unggah ketiga berkas di atas lewat web GitHub. Folder `api` beserta isinya ikut diunggah.
3. **Impor ke Vercel.** Pilih *Add New → Project*, lalu pilih repository tadi. Framework Preset: **Other**.
4. **Isi Environment Variables** sebelum menekan Deploy:

   | Nama | Isi |
   |---|---|
   | `DATABASE_URL` | connection string Neon |
   | `APP_SECRET` | teks acak panjang (minimal 32 karakter), contoh hasil `openssl rand -hex 32` |
   | `KAPRODI_PASSWORD` | kata sandi Bapak untuk menandatangani |
   | `ADMIN_PASSWORD` | kata sandi admin prodi untuk mengunggah |
   | `SIGNER_NAME` | *(opsional)* nama di stempel |
   | `SIGNER_NIP` | *(opsional)* NIP di stempel |
   | `SIGNER_TITLE` | *(opsional, bawaan: Ketua Program Studi Teknik Sipil)* |
   | `SIGNER_UNIT` | *(opsional, bawaan: Fakultas Teknik Universitas Teuku Umar)* |

5. **Deploy.** Jika ingin memakai domain sendiri (misalnya `ttd.sipilutu.online`), tambahkan di *Settings → Domains* **sebelum** mulai menandatangani surat. Alamat inilah yang tertanam di QR.

## Cara pakai

- **Admin prodi:** masuk dengan `ADMIN_PASSWORD`, buka tab *Unggah Surat*, isi perihal, nomor, dan asal, lalu pilih PDF. Surat masuk ke antrean.
- **Kaprodi:** masuk dengan `KAPRODI_PASSWORD`.
  - *Antrean:* tekan **Lihat** untuk memeriksa isi, lalu **Tanda tangani**, atau centang beberapa surat dan tekan **Tanda tangani terpilih**.
  - *Unggah sendiri:* dengan centang "Langsung saya tanda tangani", surat ditandatangani begitu diunggah dan langsung bisa diunduh.
  - *Tolak:* surat dikembalikan ke admin dengan catatan alasan.
  - *Cabut:* membatalkan tanda tangan yang sudah terbit. Halaman verifikasi akan menampilkan "dicabut" beserta alasannya.
- **Posisi stempel (seret & lepas):** saat Kaprodi menekan *Tanda tangani* (atau mengunggah dengan centang "Langsung saya tanda tangani"), surat tampil di layar beserta stempelnya. Seret stempel ke bagian yang kosong, atau klik langsung di halaman; tombol ‹ › untuk pindah halaman, tombol panah untuk menggeser sedikit. Centang *Semua halaman* bila perlu, atau *Jadikan posisi bawaan* agar posisi ini dipakai lagi berikutnya.
- **Pengaturan Stempel:** atur halaman bawaan (terakhir/pertama/semua) dan seret posisi bawaan di halaman A4 atau di surat contoh. Posisi bawaan dipakai saat *Tanda tangani terpilih* (banyak surat sekaligus). **Uji hasil pada PDF** menampilkan hasil akhir tanpa menyimpan apa pun.
- **Penerima surat:** memindai QR untuk melihat status sah. Penerima juga bisa memilih PDF yang mereka terima untuk dicocokkan; berkas dicek di perangkat mereka sendiri dan tidak diunggah.

## Catatan penting

- **Status hukum.** Sistem ini termasuk *tanda tangan elektronik tidak tersertifikasi* (UU ITE dan PP 71/2019): sah dan cocok untuk surat internal prodi. Untuk dokumen yang memerlukan TTE tersertifikasi, gunakan BSrE (BSSN) melalui universitas.
- **Batas ukuran PDF ±3 MB** karena batas permintaan Vercel. Hasil pindaian yang besar perlu dikompres dulu.
- **Surat bertanda tangan tidak bisa dihapus**, supaya QR yang sudah beredar tetap dapat diverifikasi. Gunakan *Cabut* bila perlu membatalkan.
- **Hasil cetak atau pindaian ulang** akan memiliki sidik jari berbeda. Verifikasi lewat QR tetap berlaku, sedangkan pencocokan berkas hanya berlaku untuk PDF asli hasil unduhan.
- **Kata sandi.** Ganti `KAPRODI_PASSWORD` di Vercel bila dicurigai bocor. Sesi login berlaku 12 jam.
- **Penyimpanan.** PDF disimpan di Neon. Paket gratis Neon (0,5 GB) cukup untuk kira-kira 1.000–2.000 surat berukuran rata-rata.
