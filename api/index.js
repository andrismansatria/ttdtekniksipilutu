// API Sistem Tanda Tangan Elektronik (QR) — Prodi Teknik Sipil UTU
// Satu fungsi serverless Vercel, database Neon PostgreSQL.
// Variabel lingkungan (Vercel → Settings → Environment Variables):
//   DATABASE_URL       koneksi Neon
//   APP_SECRET         teks acak panjang untuk menandai token login
//   KAPRODI_PASSWORD   kata sandi Kaprodi (penandatangan)
//   ADMIN_PASSWORD     kata sandi admin prodi (pengunggah)
//   SIGNER_NAME, SIGNER_NIP, SIGNER_TITLE, SIGNER_UNIT  (opsional, identitas di stempel)

import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql = neon(process.env.DATABASE_URL || 'postgres://belum:diatur@localhost/kosong');
const SECRET = process.env.APP_SECRET || '';
const MAX_B64 = 4_300_000; // ±3 MB PDF (batas body Vercel 4,5 MB)
const TOKEN_JAM = 12;

let ready = false;
async function init() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS surat (
    id TEXT PRIMARY KEY,
    nomor TEXT,
    perihal TEXT NOT NULL,
    pengirim TEXT,
    tanggal_surat DATE,
    nama_file TEXT,
    status TEXT NOT NULL DEFAULT 'menunggu',
    diunggah_oleh TEXT,
    diunggah_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    ditandatangani_pada TIMESTAMPTZ,
    hash_sha256 TEXT,
    catatan TEXT,
    original_b64 TEXT NOT NULL,
    signed_b64 TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS log_surat (
    id SERIAL PRIMARY KEY,
    surat_id TEXT,
    aksi TEXT NOT NULL,
    oleh TEXT,
    waktu TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS pengaturan (k TEXT PRIMARY KEY, v TEXT NOT NULL)`;
  ready = true;
}

function penandatangan() {
  return {
    nama: process.env.SIGNER_NAME || 'Ir. Andrisman Satria, S.T., M.Eng., IPM., ASEAN Eng.',
    nip: process.env.SIGNER_NIP || '199108042019031011',
    jabatan: process.env.SIGNER_TITLE || 'Ketua Program Studi Teknik Sipil',
    instansi: process.env.SIGNER_UNIT || 'Fakultas Teknik Universitas Teuku Umar',
  };
}

// ---------- token login ----------
function buatToken(role) {
  const b = Buffer.from(JSON.stringify({ role, exp: Date.now() + TOKEN_JAM * 3600e3 })).toString('base64url');
  const h = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  return `${b}.${h}`;
}
function samaPersis(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function bacaToken(t) {
  if (!t || !SECRET) return null;
  const [b, h] = t.split('.');
  if (!b || !h) return null;
  const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (!samaPersis(h, e)) return null;
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

// ID verifikasi: 10 karakter acak tanpa huruf/angka yang mirip (0/O, 1/I)
function idBaru() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[r[i] & 31];
  return s;
}

function galat(status, pesan) { const e = new Error(pesan); e.status = status; return e; }
const teks = (v, max = 300) => (v == null ? '' : String(v).trim().slice(0, max));

async function catat(suratId, aksi, oleh) {
  await sql`INSERT INTO log_surat (surat_id, aksi, oleh) VALUES (${suratId}, ${aksi}, ${oleh})`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!process.env.DATABASE_URL) throw galat(500, 'DATABASE_URL belum diatur di Vercel.');
    await init();

    const action = (req.query && req.query.action) || '';
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const user = bacaToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const perlu = (...roles) => {
      if (!user || !roles.includes(user.role)) throw galat(401, 'Sesi berakhir. Silakan masuk kembali.');
    };
    const post = () => { if (req.method !== 'POST') throw galat(405, 'Gunakan metode POST.'); };

    switch (action) {
      // ---------- publik ----------
      case 'config':
        return res.json({ penandatangan: penandatangan() });

      case 'verify': {
        const id = teks(req.query.id, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const [r] = await sql`SELECT id, nomor, perihal, pengirim, tanggal_surat, status,
            ditandatangani_pada, hash_sha256, catatan FROM surat WHERE id = ${id}`;
        if (!r || r.status === 'menunggu' || r.status === 'ditolak') return res.json({ ditemukan: false });
        return res.json({
          ditemukan: true, ...r,
          catatan: r.status === 'dicabut' ? r.catatan : null,
          penandatangan: penandatangan(),
        });
      }

      case 'login': {
        post();
        if (!SECRET) throw galat(500, 'APP_SECRET belum diatur di Vercel.');
        const pw = String(body.password || '');
        let role = null;
        if (process.env.KAPRODI_PASSWORD && samaPersis(pw, process.env.KAPRODI_PASSWORD)) role = 'kaprodi';
        else if (process.env.ADMIN_PASSWORD && samaPersis(pw, process.env.ADMIN_PASSWORD)) role = 'admin';
        if (!role) { await new Promise(r => setTimeout(r, 800)); throw galat(401, 'Kata sandi salah.'); }
        return res.json({ token: buatToken(role), role });
      }

      // ---------- perlu login ----------
      case 'list': {
        perlu('admin', 'kaprodi');
        const rows = await sql`SELECT id, nomor, perihal, pengirim, tanggal_surat, nama_file, status,
            diunggah_oleh, diunggah_pada, ditandatangani_pada, hash_sha256, catatan
          FROM surat ORDER BY diunggah_pada DESC LIMIT 1000`;
        return res.json(rows);
      }

      case 'upload': {
        post(); perlu('admin', 'kaprodi');
        const perihal = teks(body.perihal);
        const b64 = String(body.file_b64 || '');
        if (!perihal) throw galat(400, 'Perihal surat wajib diisi.');
        if (!b64) throw galat(400, 'Berkas PDF belum dipilih.');
        if (b64.length > MAX_B64) throw galat(413, 'Ukuran PDF maksimal ±3 MB.');
        if (!Buffer.from(b64.slice(0, 16), 'base64').toString('latin1').startsWith('%PDF')) throw galat(400, 'Berkas bukan PDF.');
        const tgl = /^\d{4}-\d{2}-\d{2}$/.test(body.tanggal_surat || '') ? body.tanggal_surat : null;
        const id = idBaru();
        await sql`INSERT INTO surat (id, nomor, perihal, pengirim, tanggal_surat, nama_file, diunggah_oleh, original_b64)
          VALUES (${id}, ${teks(body.nomor, 120)}, ${perihal}, ${teks(body.pengirim, 200)}, ${tgl},
                  ${teks(body.nama_file, 200)}, ${user.role}, ${b64})`;
        await catat(id, 'unggah', user.role);
        return res.json({ id });
      }

      case 'file': {
        perlu('admin', 'kaprodi');
        const jenis = req.query.type === 'signed' ? 'signed' : 'original';
        const [r] = await sql`SELECT nama_file, original_b64, signed_b64 FROM surat WHERE id = ${teks(req.query.id, 20)}`;
        if (!r) throw galat(404, 'Surat tidak ditemukan.');
        const b64 = jenis === 'signed' ? r.signed_b64 : r.original_b64;
        if (!b64) throw galat(404, 'Surat ini belum ditandatangani.');
        return res.json({ nama_file: r.nama_file, b64 });
      }

      case 'sign': {
        post(); perlu('kaprodi');
        const id = teks(body.id, 20);
        const b64 = String(body.signed_b64 || '');
        if (b64.length > MAX_B64 * 1.05) throw galat(413, 'Hasil PDF terlalu besar.');
        const buf = Buffer.from(b64, 'base64');
        if (!buf.subarray(0, 4).toString('latin1').startsWith('%PDF')) throw galat(400, 'Hasil tanda tangan bukan PDF.');
        // hash dihitung di server dari berkas final, bukan dipercaya dari browser
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        const r = await sql`UPDATE surat SET status = 'ditandatangani', signed_b64 = ${b64}, hash_sha256 = ${hash},
            ditandatangani_pada = now(), catatan = NULL
          WHERE id = ${id} AND status = 'menunggu' RETURNING id`;
        if (!r.length) throw galat(409, 'Surat tidak ada atau sudah diproses.');
        await catat(id, 'tandatangan', 'kaprodi');
        return res.json({ id, hash });
      }

      case 'reject': {
        post(); perlu('kaprodi');
        const id = teks(body.id, 20);
        const r = await sql`UPDATE surat SET status = 'ditolak', catatan = ${teks(body.catatan, 500)}
          WHERE id = ${id} AND status = 'menunggu' RETURNING id`;
        if (!r.length) throw galat(409, 'Surat tidak ada atau sudah diproses.');
        await catat(id, 'tolak', 'kaprodi');
        return res.json({ ok: true });
      }

      case 'revoke': {
        post(); perlu('kaprodi');
        const id = teks(body.id, 20);
        const alasan = teks(body.catatan, 500);
        if (!alasan) throw galat(400, 'Alasan pencabutan wajib diisi.');
        const r = await sql`UPDATE surat SET status = 'dicabut', catatan = ${alasan}
          WHERE id = ${id} AND status = 'ditandatangani' RETURNING id`;
        if (!r.length) throw galat(409, 'Hanya surat bertanda tangan yang bisa dicabut.');
        await catat(id, 'cabut', 'kaprodi');
        return res.json({ ok: true });
      }

      case 'delete': {
        post(); perlu('admin', 'kaprodi');
        // surat yang sudah ditandatangani tidak boleh dihapus agar QR tetap bisa diverifikasi
        const id = teks(body.id, 20);
        const r = await sql`DELETE FROM surat WHERE id = ${id} AND status IN ('menunggu', 'ditolak') RETURNING id`;
        if (!r.length) throw galat(409, 'Surat bertanda tangan tidak bisa dihapus; gunakan Cabut.');
        await catat(id, 'hapus', user.role);
        return res.json({ ok: true });
      }

      case 'log': {
        perlu('admin', 'kaprodi');
        const rows = await sql`SELECT aksi, oleh, waktu FROM log_surat WHERE surat_id = ${teks(req.query.id, 20)} ORDER BY waktu`;
        return res.json(rows);
      }

      case 'settings': {
        perlu('admin', 'kaprodi');
        if (req.method === 'POST') {
          perlu('kaprodi');
          const v = JSON.stringify(body.stempel || {}).slice(0, 2000);
          await sql`INSERT INTO pengaturan (k, v) VALUES ('stempel', ${v})
            ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`;
          return res.json({ ok: true });
        }
        const [r] = await sql`SELECT v FROM pengaturan WHERE k = 'stempel'`;
        return res.json({ stempel: r ? JSON.parse(r.v) : null });
      }

      default:
        throw galat(404, 'Aksi tidak dikenal.');
    }
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Kesalahan server: ' + e.message });
  }
}
