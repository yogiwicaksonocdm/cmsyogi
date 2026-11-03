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

// 6. POST: Generate draf konten otomatis — 100% lokal dari judul, tanpa API key atau layanan eksternal

function buatDrafLokal(judul) {
  const j = judul.trim();
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return [
    `${j} bukan sekadar topik lewat; ia menyentuh keseharian. Mulailah tulisan ini dengan satu pengalaman, data, atau kejadian nyata yang Anda saksikan sendiri — satu kalimat konkret lebih mengikat daripada sepuluh kalimat umum.`,
    `Tiga hal yang sebaiknya dibahas lebih dalam:\n• Mengapa ${j} penting saat ini — beri latar belakang singkat yang dipahami siapa pun.\n• Dampak atau manfaatnya — tampilkan contoh nyata, angka, atau pengalaman agar terasa hidup.\n• Langkah praktis untuk pembaca — tulis dua sampai tiga tindakan sederhana yang bisa langsung dicoba.`,
    `Kembangkan poin-poin di atas dengan bahasa yang hangat, seolah berbicara kepada pembaca terdekat. Sisipkan kutipan atau pendapat tokoh bila perlu — sesuai semangat Abzah CMS: "Membaca dan Menulis adalah Nutrisi Otak".`,
    `Abzah CMS — ${today}. Tutup dengan ajakan bertindak: apa satu hal kecil yang ingin Anda lakukan pembaca setelah membaca tulisan ini?`
  ].join('\n\n');
}

app.post('/api/generate', (req, res) => {
  const { title } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Isi judul dulu sebelum generate konten otomatis' });
  }
  res.status(200).json({
    success: true,
    content: buatDrafLokal(title),
    message: 'Draf kerangka dibuat secara lokal. Silakan sunting dengan isi Anda sebelum menyimpan.'
  });
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
