const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../database/db');
const { getEmbeddings } = require('../services/xai');
const { chunkText } = require('../services/chunker');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads (use /tmp on Vercel due to read-only filesystem)
const uploadsDir = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.md', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt, .md, and .pdf files are allowed'));
    }
  }
});

// Get all documents for user
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload document
router.post('/', ensureAuthenticated, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Read file content
    let content;
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      content = pdfData.text;
    } else {
      content = await fs.readFile(req.file.path, 'utf-8');
    }

    // Insert document record
    const docResult = await client.query(
      `INSERT INTO documents (user_id, filename, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        req.user.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      ]
    );
    const documentId = docResult.rows[0].id;

    // Chunk the content
    const chunks = chunkText(content);

    if (chunks.length > 0) {
      // Get embeddings for all chunks
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await getEmbeddings(chunkTexts);

      // Insert chunks
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4)`,
          [documentId, chunks[i].index, chunks[i].content, JSON.stringify(embeddings[i])]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: documentId,
      original_name: req.file.originalname,
      chunks_count: chunks.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error uploading document:', err);

    // Clean up uploaded file on error
    try {
      await fs.unlink(req.file.path);
    } catch (unlinkErr) {
      console.error('Error cleaning up file:', unlinkErr);
    }

    res.status(500).json({ error: 'Failed to upload document' });
  } finally {
    client.release();
  }
});

// Delete document
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    // Get filename before deleting
    const doc = await db.query(
      'SELECT filename FROM documents WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (doc.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from database (cascades to chunks)
    await db.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    // Delete file
    try {
      await fs.unlink(path.join(uploadsDir, doc.rows[0].filename));
    } catch (err) {
      console.error('Error deleting file:', err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Search documents by semantic similarity
router.get('/search', ensureAuthenticated, async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const { getEmbedding } = require('../services/xai');
    const queryEmbedding = await getEmbedding(q);

    const result = await db.query(
      `SELECT dc.id, dc.content, dc.chunk_index,
              d.id as document_id, d.original_name,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.user_id = $2 AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), req.user.id, parseInt(limit)]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error searching documents:', err);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

module.exports = router;
