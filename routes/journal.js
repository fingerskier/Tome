const express = require('express');
const db = require('../database/db');
const { getEmbedding } = require('../services/xai');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Get all journal entries for user
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, content, created_at, updated_at
       FROM journal_entries
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching journal entries:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Create new journal entry
router.post('/', ensureAuthenticated, async (req, res) => {
  const { title, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // Get embedding from X.ai
    const textForEmbedding = title ? `${title}\n\n${content}` : content;
    const embedding = await getEmbedding(textForEmbedding);

    const result = await db.query(
      `INSERT INTO journal_entries (user_id, title, content, embedding)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, created_at`,
      [req.user.id, title || null, content, JSON.stringify(embedding)]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating journal entry:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// Update journal entry
router.put('/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // Verify ownership
    const check = await db.query(
      'SELECT id FROM journal_entries WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Get new embedding
    const textForEmbedding = title ? `${title}\n\n${content}` : content;
    const embedding = await getEmbedding(textForEmbedding);

    const result = await db.query(
      `UPDATE journal_entries
       SET title = $1, content = $2, embedding = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING id, title, content, created_at, updated_at`,
      [title || null, content, JSON.stringify(embedding), id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating journal entry:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// Delete journal entry
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting journal entry:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// Search journal entries by semantic similarity
router.get('/search', ensureAuthenticated, async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const queryEmbedding = await getEmbedding(q);

    const result = await db.query(
      `SELECT id, title, content, created_at,
              1 - (embedding <=> $1::vector) as similarity
       FROM journal_entries
       WHERE user_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), req.user.id, parseInt(limit)]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error searching journal entries:', err);
    res.status(500).json({ error: 'Failed to search entries' });
  }
});

module.exports = router;
