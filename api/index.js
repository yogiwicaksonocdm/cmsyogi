const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

// Inisialisasi Firebase Admin
if (!admin.apps.length) {
  let serviceAccount;
  
  // Mendukung kredensial dari Environment Variable (untuk Vercel) atau file lokal
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require('./serviceAccountKey.json'); // Opsional untuk lokal
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const app = express();

// === Konfigurasi AI (auto generated content) ===
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://freebuff.com/api/v1/paid';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

app.use(cors());
app.use(express.json());

// 1. GET: Ambil semua artikel/konten
app.get('/api/posts', async (req, res) => {
  try {
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
    const posts = [];
    snapshot.forEach(doc => {
      posts.push({ id: doc.id, ...doc.data() }); // <--- DIPERBAIKI DI SINI (menggunakan .push())
    });
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET: Ambil detail artikel berdasarkan ID
app.get('/api/posts/:id', async (req, res) => {
  try {
    const docRef = db.collection('posts').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Konten tidak ditemukan' });
    }
    res.status(200).json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. POST: Generate draf konten otomatis dengan AI (OPENAI_API_KEY milik owner, tidak pernah ke browser)
app.post('/api/generate', async (req, res) => {
  const { title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Isi judul dulu sebelum generate konten otomatis' });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY belum diatur. Owner dapat membuat dan mengisi key di freebuff.com/account/api (Local: file .env / Vercel: Environment Variables).'
    });
  }
  try {
    const prompt = [
      'Tulis draf konten artikel berbahasa Indonesia yang mengalir dan menarik untuk CMS "Abzah CMS".',
      `Judul: "${title.trim()}".`,
      'Gaya: informatif, hangat, seperti berbagi gagasan.',
      'Aturan: 3-4 paragraf polos (tanpa heading Markdown, tanpa tanda -*-), langsung isi konten saja tanpa pembuka seperti "Berikut draf".'
    ].join(' ');
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 700,
        temperature: 0.8
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('AI API error', response.status, detail);
      return res.status(502).json({ success: false, error: `AI API merespons ${response.status}. Cek kunci OPENAI_API_KEY dan model (${AI_MODEL}).` });
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return res.status(502).json({ success: false, error: 'AI tidak menghasilkan konten. Coba lagi.' });
    }
    res.status(200).json({ success: true, content });
  } catch (error) {
    console.error('Generator error:', error);
    res.status(500).json({ success: false, error: `Gagal generate konten: ${error.message}` });
  }
});

// 3. POST: Tambah artikel baru
app.post('/api/posts', async (req, res) => {
  try {
    const { title, content, author } = req.body;
    const newPost = {
      title,
      content,
      author: author || 'Admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('posts').add(newPost);
    res.status(201).json({ success: true, id: docRef.id, message: 'Konten berhasil ditambahkan' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. PUT: Update artikel
app.put('/api/posts/:id', async (req, res) => {
  try {
    const { title, content, author } = req.body;
    const docRef = db.collection('posts').doc(req.params.id);
    await docRef.update({
      title,
      content,
      author,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true, message: 'Konten berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. DELETE: Hapus artikel
app.delete('/api/posts/:id', async (req, res) => {
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
} // <--- DIPERBAIKI DI SINI (tanda kurung tutup yang benar)
