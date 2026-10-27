const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Inisialisasi Firebase Admin
if (!admin.apps.length) {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Jalur 1: JSON service account utuh dari Environment Variable (mis. di Vercel)
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // Jalur 2: kredensial terpisah FIREBASE_* dari .env / Vercel
    serviceAccount = {
      type: process.env.FIREBASE_TYPE || 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      // Nilai di .env/Vercel sering memakai "\n" sebagai pengganti newline
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || 'googleapis.com'
    };
  } else {
    // Jalur 3: file service account di project root (lokal)
    const candidate = path.join(__dirname, '..', 'buatcmsbaru-firebase-adminsdk-fbsvc-e7561914ac.json');
    if (fs.existsSync(candidate)) {
      serviceAccount = require(candidate);
    } else {
      serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

// ===== Autentikasi Admin =====
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('PERINGATAN: ADMIN_PASSWORD tidak diatur, memakai password default "admin123". Set ADMIN_PASSWORD di env!');
}
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || `cms-secret::${ADMIN_PASSWORD}`;

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(value)).digest('hex');
}

function createToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  return `${exp}.${sign(exp)}`;
}

function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.get('x-admin-token') || '');
  if (!isValidToken(token)) {
    return res.status(401).json({ success: false, message: 'Tidak diizinkan. Silakan login sebagai admin.' });
  }
  next();
}

// ===== AUTH =====
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Password salah' });
  }
  res.status(200).json({ success: true, token: createToken(), expiresInMs: SESSION_TTL_MS });
});

app.get('/api/admin/check', (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!isValidToken(token)) {
    return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
  }
  res.status(200).json({ success: true });
});

// ===== PUBLIK: hanya konten yang dipublish =====

// 1. GET: Daftar konten (hanya published)
app.get('/api/posts', async (req, res) => {
  try {
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
    const posts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.status && data.status !== 'published') return; // draft disembunyikan dari publik
      posts.push({ id: doc.id, ...data });
    });
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET: Detail konten publik (hanya published)
app.get('/api/posts/:id', async (req, res) => {
  try {
    const doc = await db.collection('posts').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan' });
    }
    const data = doc.data();
    if (data.status && data.status !== 'published') {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan' });
    }
    res.status(200).json({ success: true, data: { id: doc.id, ...data } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ADMIN: konten semua status + semua operasi tulis (proteksi token) =====

// 3. GET admin: daftar semua konten, termasuk draft
app.get('/api/admin/posts', requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
    const posts = [];
    snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET admin: detail konten apa pun statusnya (untuk form edit)
app.get('/api/admin/posts/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await db.collection('posts').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan' });
    }
    res.status(200).json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. POST: Tambah konten baru (admin)
app.post('/api/posts', requireAdmin, async (req, res) => {
  try {
    const { title, content, author, status } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Judul dan konten wajib diisi' });
    }
    const newPost = {
      title,
      content,
      author: author || 'Admin',
      status: status === 'draft' ? 'draft' : 'published',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('posts').add(newPost);
    res.status(201).json({ success: true, id: docRef.id, message: 'Konten berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. PUT: Update konten (admin), termasuk ganti status publish/draft
app.put('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    const { title, content, author, status } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Judul dan konten wajib diisi' });
    }
    const docRef = db.collection('posts').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan' });
    }
    await docRef.update({
      title,
      content,
      author: author || 'Admin',
      status: status === 'draft' ? 'draft' : 'published',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true, message: 'Konten berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. DELETE: Hapus konten (admin)
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
  try {
    await db.collection('posts').doc(req.params.id).delete();
    res.status(200).json({ success: true, message: 'Konten berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export untuk Vercel Serverless
module.exports = app;

// Jalankan server lokal jika tidak di Vercel
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
