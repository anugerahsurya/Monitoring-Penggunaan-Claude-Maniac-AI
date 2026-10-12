# Monitoring-Penggunaan-Claude-Maniac-AI

**Monitoring Claude** (by Maniac AI) adalah dashboard tim untuk memantau penggunaan Claude Code harian. Fokus utamanya **batas jendela 5 jam** dan **batas mingguan** dalam satuan token.

Dashboard ini tidak memakai token Claude. Skrip pengumpul hanya membaca file log di komputer masing-masing anggota.

```
PC anggota (Rafi, Surya, Nisa, Sofi)          Supabase                Vercel
~/.claude/projects/*.jsonl ─ collector/collect.py ─▶ tabel ringkasan ─▶ dashboard React
```

## 1. Siapkan Supabase (sekali)
1. Buat proyek di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, tempel isi [`supabase/schema.sql`](supabase/schema.sql), lalu klik **Run**.
3. Ambil token unggah untuk tiap anggota dengan query `select member, token from ingest_tokens;`. Bagikan token ke pemiliknya secara pribadi.
4. Catat **Project URL** dan **anon public key** dari *Project Settings → API*.

## 2. Deploy ke Vercel
1. Import repo ini di Vercel. Framework akan terdeteksi otomatis sebagai **Vite**.
2. Isi *Environment Variables* (lihat [`.env.example`](.env.example)):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Opsional: `VITE_LIMIT_5H_TOKENS` (default 1.000.000) dan `VITE_LIMIT_WEEK_TOKENS` (default 10.000.000)
3. Klik Deploy.

## 3. Setiap anggota: kirim data penggunaan
1. Pastikan Python 3 terpasang.
2. Salin `collector/config.example.json` menjadi `collector/config.json`, lalu isi URL, anon key, dan **token unggah milik sendiri**.
3. Klik ganda `collector/Unggah Penggunaan.bat` (atau jalankan `py collector/collect.py`).

Jalankan setiap kali ingin memperbarui data, misalnya di akhir sesi kerja. Supaya otomatis, tambahkan ke Windows Task Scheduler, misalnya setiap jam.

Data yang sudah terunggah tetap tersimpan di Supabase, walaupun Claude Code menghapus log lama (bawaannya setelah 30 hari).

## Pengembangan lokal
```bash
npm install
npm run data:local   # buat public/local-data.json dari log di PC ini (tanpa Supabase)
npm run dev
```
Jika `VITE_SUPABASE_URL` tidak diisi, dashboard membaca `public/local-data.json`. File ini tidak ikut di-commit.

## Catatan penting
- **Batas token bisa diatur.** Anthropic tidak mempublikasikan batas paket langganan dalam angka token. Cocokkan angka di dashboard dengan persentase di Claude → Settings → Usage, lalu sesuaikan lewat tombol **⚙ Atur batas**. Pengaturan disimpan per browser.
- **Token terhitung** = input + cache write + output. Cache read bisa ikut dihitung lewat pengaturan.
- **Jendela 5 jam** dimulai pada jam (dibulatkan ke bawah) dari pesan pertama dan berlaku 5 jam. Perhitungannya per anggota.
- **Jadwal piket** Senin–Kamis diacak otomatis setiap minggu, dan urutannya sama di semua perangkat. Jumat–Minggu bebas. Daftar nama ada di `src/lib/piket.js`.
- Biaya yang ditampilkan adalah **estimasi setara tarif API**, bukan tagihan langganan.
- Data dashboard bisa dibaca siapa pun yang punya URL-nya (kunci anon Supabase bersifat publik). Penulisan data hanya bisa dilakukan lewat token unggah.
