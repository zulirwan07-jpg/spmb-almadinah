# Aplikasi Rekapitulasi Pembayaran SPMB Online

## Isi paket
- `public/index.html`: antarmuka HTML aplikasi yang diunggah, dengan login server dan penyimpanan melalui API.
- `server.js`: API Node.js/Express, autentikasi admin, dan koneksi PostgreSQL.
- `package.json`: dependensi dan perintah start.

## Variabel lingkungan yang wajib diatur pada layanan Helipod
- `DATABASE_URL`: connection string PostgreSQL Helipod. Masukkan sebagai secret/private variable; jangan masukkan ke HTML atau GitHub.
- `JWT_SECRET`: string acak panjang minimal 32 karakter.
- `ADMIN_PASSWORD`: password admin awal minimal 10 karakter.
- `PORT`: opsional, default 8080.

## Jalankan lokal
1. `npm install`
2. Atur variabel lingkungan.
3. `npm start`

Server membuat tabel `app_users` dan `app_state` otomatis pada database yang ditunjuk `DATABASE_URL`.

## Catatan penting
Paket ini menghubungkan data state aplikasi ke PostgreSQL dan melindungi API dengan sesi admin. Periksa seluruh alur menu dan lakukan uji simpan/baca sebelum digunakan untuk data pendaftaran aktif. Menu/fitur yang memang tidak terdapat pada HTML sumber tidak otomatis ditambahkan oleh paket ini.
