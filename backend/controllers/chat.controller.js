const {
  generateResponse,
  generateResponseStream,
  generateEmbedding,
} = require('../services/gemini.service');
const { searchSimilar } = require('../services/pinecone.service');
const { runAgentChat } = require('../services/agent.service');

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
 * Normalize an optional list of allowed document IDs from body or query.
 */
function parseAllowedDocIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Retrieve relevant Pinecone chunks above minScore and build a grounded prompt.
 */
async function buildGroundedPrompt(
  message,
  { topK = 3, minScore, allowedDocIds, strictDocs = false } = {}
) {
  const isScoped = Array.isArray(allowedDocIds) && allowedDocIds.length > 0;
  const requireDocs = isScoped || strictDocs;
  let sources = [];
  let prompt = message;

  try {
    const queryVector = await generateEmbedding(message);
    sources = await searchSimilar({
      vector: queryVector,
      topK,
      ...(minScore !== undefined ? { minScore } : {}),
      ...(isScoped ? { allowedDocIds } : {}),
    });

    const contextBlocks = sources
      .map((s) => {
        const title = s.metadata?.title || s.id;
        const body = s.metadata?.text || '';
        return `[Source: ${title}]\n${body}`.trim();
      })
      .filter((b) => b.length > 0);

    if (contextBlocks.length > 0) {
      const groundingRules = [
        'Only use information from the provided Context below. Do NOT add external knowledge, assumptions, or unmentioned concepts.',
        'Be concise and proportional to what the Context supports—do not over-expand.',
        'Cite every claim inline using the exact source label, e.g. (source: google-seo.md-40).',
        'If a chunk includes a relevant URL, preserve and link that exact URL in your answer.',
      ].join('\n- ');

      const instruction = requireDocs
        ? `You are a strict document-grounded assistant.\n- ${groundingRules}\n- If the Context does not contain the answer, reply that the provided documents do not contain that information.`
        : `You are an AI assistant grounded on domain knowledge.\n- ${groundingRules}\n- If the Context does not contain the answer, state that clearly before providing brief general assistance.`;

      prompt = `${instruction}

Context:
${contextBlocks.join('\n\n---\n\n')}

Question: ${message}`;
    } else if (requireDocs) {
      return {
        prompt: null,
        sources: [],
        grounded: false,
        refusal: isScoped
          ? 'I could not find relevant information for that in the selected document(s).'
          : 'I can only answer based on your uploaded documents, and no relevant information was found.',
      };
    }
  } catch (searchErr) {
    console.warn('Pinecone search fallback notice:', searchErr.message);
    if (requireDocs) {
      return {
        prompt: null,
        sources: [],
        grounded: false,
        refusal: 'Unable to retrieve from the selected documents right now.',
      };
    }
  }

  return { prompt, sources, grounded: sources.length > 0, refusal: null };
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
  const allowedDocIds = parseAllowedDocIds(
    req.body?.allowedDocIds ?? req.query?.allowedDocIds
  );
  const rawStrict = req.body?.strictDocs ?? req.query?.strictDocs;
  const strictDocs = rawStrict === true || rawStrict === 'true';
  const rawAgentic = req.body?.agentic ?? req.query?.agentic;
  const mode = typeof req.body?.mode === 'string' ? req.body.mode : typeof req.query?.mode === 'string' ? req.query.mode : 'rag';
  const agentic = rawAgentic === true || rawAgentic === 'true' || mode === 'sfx';
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  return { message, minScore, topK, allowedDocIds, strictDocs, agentic, history, mode };
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
    const {
      message,
      minScore,
      topK,
      allowedDocIds,
      strictDocs,
      agentic,
      history,
      mode,
    } = parseChatParams(req);
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (agentic) {
      const result = await runAgentChat({
        message,
        history,
        allowedDocIds,
        strictDocs,
        minScore,
        mode,
      });

      return res.json({
        reply: result.reply,
        sources: result.sources,
        grounded: result.grounded,
        agentic: true,
        steps: result.steps,
        toolExecutions: result.toolExecutions || [],
      });
    }

    const { prompt, sources, grounded, refusal } = await buildGroundedPrompt(
      message,
      {
        topK,
        minScore,
        allowedDocIds,
        strictDocs,
      }
    );

    const reply = refusal ?? (await generateResponse(prompt));

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
  const {
    message,
    minScore,
    topK,
    allowedDocIds,
    strictDocs,
    agentic,
    history,
    mode,
  } = parseChatParams(req);
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
    if (agentic) {
      const result = await runAgentChat({
        message,
        history,
        allowedDocIds,
        strictDocs,
        minScore,
        mode,
        shouldAbort: () => clientClosed,
        onTool: (toolCall) => sendSseEvent(res, 'tool', toolCall),
        onToolResult: (toolResult) => sendSseEvent(res, 'tool_result', toolResult),
        onSources: (sources, grounded) =>
          sendSseEvent(res, 'sources', { sources, grounded }),
        onDelta: (text) => sendSseEvent(res, 'delta', { text }),
      });

      if (!clientClosed) {
        sendSseEvent(res, 'done', {
          grounded: result.grounded,
          agentic: true,
          toolExecutions: result.toolExecutions || [],
        });
      }
      return res.end();
    }

    const { prompt, sources, grounded, refusal } = await buildGroundedPrompt(
      message,
      {
        topK,
        minScore,
        allowedDocIds,
        strictDocs,
      }
    );
    if (clientClosed) return res.end();

    sendSseEvent(res, 'sources', { sources, grounded });

    if (refusal) {
      sendSseEvent(res, 'delta', { text: refusal });
      sendSseEvent(res, 'done', { grounded: false });
      return res.end();
    }

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
