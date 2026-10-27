const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Inisialisasi Firebase Admin
if (!admin.apps.length) {
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Abail 1: JSON service account utuh dari Environment Variable (mis. di Vercel)
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // Abail 2: kredensial terpisah FIREBASE_* dari .env / Vercel
    serviceAccount = {
      type: process.env.FIREBASE_TYPE || 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      // Nilai di .env/Vercel sering memakai "\\n" sebagai pengganti newline
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
    // Abail 3: file service account di project root (lokal)
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
