require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { PDFParse } = require('pdf-parse');
const {
  generateResponse,
  generateEmbedding,
} = require('./services/gemini.service');
const {
  upsertDocument,
  searchSimilar,
  getIndexStats,
} = require('./services/pinecone.service');
const chunkText = require('./utils/chunker');
const { upload } = require('./middleware/upload');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('RAG Backend Server is running');
});

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

// Ingest documents: Embed with Gemini -> Store in Pinecone
app.post('/ingest', async (req, res) => {
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
});

// Upload a document file (.txt, .md, .pdf)
app.post('/ingest/file', upload.single('file'), async (req, res) => {
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
});

// Chat endpoint: Semantic vector retrieval + Gemini response generation
async function handleChat(req, res) {
  try {
    const message = req.body?.message ?? req.query?.message;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    let sources = [];
    let prompt = message;

    try {
      // 1. Embed query
      const queryVector = await generateEmbedding(message);

      // 2. Retrieve top matching chunks from Pinecone
      sources = await searchSimilar({ vector: queryVector, topK: 3 });

      // 3. If sources found, build grounded context prompt
      const contextBlocks = sources
        .map((s) => {
          const title = s.metadata?.title || s.id;
          const body = s.metadata?.text || '';
          return `[Source: ${title}]\n${body}`.trim();
        })
        .filter((b) => b.length > 0);

      if (contextBlocks.length > 0) {
        prompt = `You are an AI assistant grounded on domain knowledge. Answer the question accurately using the provided context. If the answer cannot be deduced from the context, state that clearly before providing general assistance.

Context:
${contextBlocks.join('\n\n---\n\n')}

Question: ${message}`;
      }
    } catch (searchErr) {
      console.warn('Pinecone search fallback notice:', searchErr.message);
      // Fallback: Continue without Pinecone grounding if index is empty
    }

    // 4. Generate answer via Gemini
    const reply = await generateResponse(prompt);

    res.json({
      reply,
      sources,
      grounded: sources.length > 0,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
}

app.get('/chat', handleChat);
app.post('/chat', handleChat);

// Index status / health endpoint
app.get('/status', async (req, res) => {
  try {
    const stats = await getIndexStats();
    res.json({
      status: 'online',
      index: process.env.PINECONE_INDEX_NAME,
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
