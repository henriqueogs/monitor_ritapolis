function splitTextIntoChunks(
  text,
  { chunkSizeChars, chunkOverlapChars, maxChunksPerDocument }
) {
  const source = String(text || '').trim();
  if (!source) {
    return [];
  }

  if (source.length <= chunkSizeChars) {
    return [source];
  }

  const chunks = [];
  let cursor = 0;
  const step = Math.max(chunkSizeChars - chunkOverlapChars, 1);

  while (cursor < source.length) {
    const nextChunk = source.slice(cursor, cursor + chunkSizeChars).trim();
    if (nextChunk) {
      chunks.push(nextChunk);
    }

    if (chunks.length > maxChunksPerDocument) {
      throw new Error(
        `Documento excede o limite de ${maxChunksPerDocument} chunks para processamento seguro`
      );
    }

    cursor += step;
  }

  return chunks;
}

module.exports = {
  splitTextIntoChunks
};
