require('dotenv').config();

const XAI_API_URL = 'https://api.x.ai/v1/embeddings';

async function getEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text is required for embedding');
  }

  const response = await fetch(XAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.XAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X.ai API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function getEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Array of texts is required');
  }

  const response = await fetch(XAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.XAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X.ai API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data.map(d => d.embedding);
}

module.exports = { getEmbedding, getEmbeddings };
