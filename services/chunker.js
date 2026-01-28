const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence or paragraph boundary
    if (end < text.length) {
      const slice = text.slice(start, end + 100);
      const breakPoints = [
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! '),
      ].filter(i => i > chunkSize - 200 && i < chunkSize + 50);

      if (breakPoints.length > 0) {
        end = start + Math.max(...breakPoints) + 1;
      }
    }

    const chunk = text.slice(start, Math.min(end, text.length)).trim();
    if (chunk.length > 0) {
      chunks.push({
        index: chunks.length,
        content: chunk,
      });
    }

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

module.exports = { chunkText, CHUNK_SIZE, CHUNK_OVERLAP };
