const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { generateEmbedding } = require('../services/gemini.service');
const { upsertDocument } = require('../services/pinecone.service');
const chunkText = require('../utils/chunker');

/**
 * Chunk text, generate Gemini embeddings for each chunk, and upsert into Pinecone.
 */
async function ingestText({ id, text, title, metadata = {} }) {
  const baseTitle = title || metadata.title || id;
  const chunks = chunkText(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkId = `${id}-${i}`;
    const chunkTitle = `${baseTitle}-${i}`;
    const values = await generateEmbedding(chunk);

    await upsertDocument({
      id: chunkId,
      values,
      title: chunkTitle,
      text: chunk,
      metadata: { ...metadata, title: chunkTitle },
    });
  }

  return { id, title: baseTitle, chunksCount: chunks.length };
}

/**
 * POST /ingest — Embed raw text and upsert chunks to Pinecone.
 */
async function ingestDocumentController(req, res) {
  try {
    const { id, text, title, metadata = {} } = req.body;
    if (!id || !text) {
      return res.status(400).json({ error: 'id and text are required' });
    }

    const result = await ingestText({ id, text, title, metadata });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /ingest/file — Extract text from .pdf, .txt, or .md file and ingest into Pinecone.
 */
async function ingestFileController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    if (ext === '.pdf') {
      const buffer = fs.readFileSync(req.file.path);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
    } else {
      text = fs.readFileSync(req.file.path, 'utf-8');
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'No readable text found in file' });
    }

    const ingestResult = await ingestText({
      id: req.body?.id || req.file.filename,
      text,
      title: req.body?.title || req.file.originalname,
      metadata: {
        filename: req.file.filename,
        originalname: req.file.originalname,
      },
    });

    res.json({
      ok: true,
      ...ingestResult,
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
      },
      textLength: text.length,
    });
  } catch (err) {
    console.error('File ingest error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  ingestDocumentController,
  ingestFileController,
};
