const {
  generateResponse,
  generateResponseStream,
  generateEmbedding,
} = require('../services/gemini.service');
const { searchSimilar } = require('../services/pinecone.service');

/**
 * Parse an optional bounded numeric parameter.
 */
function parseOptionalNumber(raw, min, max) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) return undefined;
  return num;
}

/**
 * Retrieve relevant Pinecone chunks above minScore and build a grounded prompt.
 */
async function buildGroundedPrompt(message, { topK = 3, minScore } = {}) {
  let sources = [];
  let prompt = message;

  try {
    const queryVector = await generateEmbedding(message);
    sources = await searchSimilar({
      vector: queryVector,
      topK,
      ...(minScore !== undefined ? { minScore } : {}),
    });

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
  }

  return { prompt, sources, grounded: sources.length > 0 };
}

/**
 * Extract and validate common chat query parameters from request.
 */
function parseChatParams(req) {
  const message = req.body?.message ?? req.query?.message;
  const minScore = parseOptionalNumber(
    req.body?.minScore ?? req.query?.minScore,
    0,
    1
  );
  const topK =
    parseOptionalNumber(req.body?.topK ?? req.query?.topK, 1, 10) ?? 3;
  return { message, minScore, topK };
}

/**
 * Write a single Server-Sent Event frame to the response stream.
 */
function sendSseEvent(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET / POST /chat — Embed query, retrieve Pinecone context, and generate Gemini response.
 */
async function handleChat(req, res) {
  try {
    const { message, minScore, topK } = parseChatParams(req);
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const { prompt, sources, grounded } = await buildGroundedPrompt(message, {
      topK,
      minScore,
    });

    const reply = await generateResponse(prompt);

    res.json({
      reply,
      sources,
      grounded,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET / POST /chat/stream — Stream Gemini tokens via Server-Sent Events (SSE).
 */
async function handleChatStream(req, res) {
  const { message, minScore, topK } = parseChatParams(req);
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const { prompt, sources, grounded } = await buildGroundedPrompt(message, {
      topK,
      minScore,
    });
    if (clientClosed) return res.end();

    sendSseEvent(res, 'sources', { sources, grounded });

    const stream = await generateResponseStream(prompt);
    for await (const chunk of stream) {
      if (clientClosed) break;
      const text = chunk?.text || '';
      if (text) {
        sendSseEvent(res, 'delta', { text });
      }
    }

    if (!clientClosed) {
      sendSseEvent(res, 'done', { grounded });
    }
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    if (!clientClosed) {
      sendSseEvent(res, 'error', { error: err.message || 'Streaming failed' });
      res.end();
    }
  }
}

module.exports = {
  handleChat,
  handleChatStream,
};
