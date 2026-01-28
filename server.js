require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const journalRoutes = require('./routes/journal');
const documentRoutes = require('./routes/documents');
const { ensureAuthenticatedRedirect } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/documents', documentRoutes);

// Serve app page (protected)
app.get('/app', ensureAuthenticatedRedirect, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Landing page
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/app');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global search across journal and documents
app.get('/api/search', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { q, limit = 10 } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const { getEmbedding } = require('./services/xai');
    const db = require('./database/db');

    const queryEmbedding = await getEmbedding(q);
    const embeddingStr = JSON.stringify(queryEmbedding);

    // Search journal entries
    const journalResults = await db.query(
      `SELECT 'journal' as type, id, title, content, created_at,
              1 - (embedding <=> $1::vector) as similarity
       FROM journal_entries
       WHERE user_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [embeddingStr, req.user.id, Math.ceil(parseInt(limit) / 2)]
    );

    // Search document chunks
    const docResults = await db.query(
      `SELECT 'document' as type, dc.id, d.original_name as title, dc.content, d.created_at,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.user_id = $2 AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $3`,
      [embeddingStr, req.user.id, Math.ceil(parseInt(limit) / 2)]
    );

    // Combine and sort by similarity
    const results = [...journalResults.rows, ...docResults.rows]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, parseInt(limit));

    res.json(results);
  } catch (err) {
    console.error('Error in global search:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Tome server running on http://localhost:${PORT}`);
});
