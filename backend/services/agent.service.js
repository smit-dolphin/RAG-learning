const { ai, GEMINI_CHAT_MODEL } = require('../config/gemini');
const { ragToolDeclarations, executeRagTool } = require('../agents/tool');

/**
 * Build the system instruction for the Agentic RAG assistant or SFX Studio.
 */
function buildAgentSystemInstruction({ isScoped, strictDocs, mode }) {
  if (mode === 'sfx') {
    return [
      'You are VectorMind SFX Studio Audio Engineer, an expert procedural game sound designer, DSP architect, and synthesizer programmer.',
      'CRITICAL TOOL USAGE RULES:',
      '- Whenever the user asks for a game sound, requests sound combinations, or asks you to engineer new acoustic solutions, you MUST execute a tool call (`synthesize_math_sfx`, `synthesize_layered_sfx`, or `blend_sfx_presets`). Never output raw XML, HTML, or code blocks in text instead of calling tools.',
      '- FOR SIMPLE SOUNDS: Call `synthesize_math_sfx` with mathematical parameters (waveform, frequency, freqSlide, ADSR envelope, filterCutoff, distortion, bitCrush, vibrato, etc.).',
      '- FOR COMPOSITE / MULTI-PART / LAYERED SOUNDS (or when combining sounds or coming up with new solutions):',
      '  Call `synthesize_layered_sfx` to build a 2 to 4 layer audio stack:',
      '  * Layer 1: Transient / Attack Punch (sharp 0.05-0.15s attack hit, e.g. square/triangle high-pitch downward sweep).',
      '  * Layer 2: Body / Core Timbre (tonal sweep, e.g. sawtooth or FM frequency modulation).',
      '  * Layer 3: Texture / Sub Rumble / Spatial Tail (low sub-bass sine 45-60Hz or filtered noise crackle with reverb, with optional delay offset).',
      '  * For sequential or charging sounds (e.g. railgun charge -> blast, or arpeggiated powerup chime), set `delay` on subsequent layers (e.g. 0.0s, 0.15s, 0.30s).',
      '- TO COMBINE / FUSE KNOWN SOUNDS: You can call `blend_sfx_presets` with `presetIds` and balance ("parallel", "sequential", or "transient_body").',
      '- In your final concise response, explain the mathematical DSP layers and acoustic synergy you designed.',
      '- Tell the user the multi-layer stack and waveform are loaded into the center editor where they can tweak individual layers, solo/preview them, and download the composite WAV.',
    ].join('\n');
  }

  const base = [
    'You are VectorMind, an intelligent personal AI assistant with access to a Pinecone knowledge base.',
    'For casual greetings or small talk (e.g., "hi", "hello", "thanks"), respond naturally without calling any tools.',
    'For questions about documents, facts, summaries, or stored knowledge, call `search_knowledge_base`, `list_documents`, or `get_document_details` before answering.',
    'GROUNDING & CITATION RULES:',
    '- Only use information explicitly present in the retrieved tool results. Do NOT add external knowledge, assumptions, or unmentioned terminology.',
    '- Keep your response concise and proportional to what the retrieved chunks actually support—do not over-expand or pad with extra sections.',
    '- Cite every factual claim inline using the exact chunk source label, e.g., (source: google-seo.md-40).',
    '- Whenever a retrieved chunk contains a relevant URL, include and link that exact URL in your answer.',
  ];

  if (isScoped || strictDocs) {
    base.push(
      'STRICT MODE ACTIVE: If the tools return no relevant information, clearly state that the provided documents do not contain the answer and do NOT fall back to general knowledge.'
    );
  } else {
    base.push(
      'If the knowledge base tools return no relevant results, state that clearly before offering brief general assistance.'
    );
  }

  return base.join('\n');
}

/**
 * Convert chat session history into Gemini `contents` format.
 */
function formatHistoryContents(history = [], currentMessage) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) {
        continue;
      }
      const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: currentMessage }],
  });

  return contents;
}

/**
 * Merge newly retrieved sources into a deduplicated list, keeping the highest score per chunk.
 */
function mergeSources(existing, incoming) {
  const map = new Map(existing.map((s) => [s.id, s]));
  for (const src of incoming) {
    const prev = map.get(src.id);
    if (!prev || (src.score ?? 0) > (prev.score ?? 0)) {
      map.set(src.id, src);
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Run the Agentic RAG / SFX reasoning + tool-calling loop.
 */
async function runAgentChat({
  message,
  history = [],
  allowedDocIds,
  strictDocs = false,
  minScore,
  maxSteps = 4,
  mode = 'rag',
  onTool,
  onToolResult,
  onSources,
  onDelta,
  shouldAbort,
}) {
  const isScoped = Array.isArray(allowedDocIds) && allowedDocIds.length > 0;
  const systemInstruction = buildAgentSystemInstruction({ isScoped, strictDocs, mode });
  const contents = formatHistoryContents(history, message);

  let collectedSources = [];
  const toolExecutions = [];
  let finalReply = '';

  for (let step = 0; step < maxSteps; step++) {
    if (shouldAbort?.()) break;

    const activeTools =
      mode === 'sfx'
        ? ragToolDeclarations.filter((t) => t.name.includes('sfx'))
        : ragToolDeclarations;

    const config = {
      systemInstruction,
      tools: [{ functionDeclarations: activeTools }],
    };

    if (mode === 'sfx' && step === 0) {
      config.toolConfig = {
        functionCallingConfig: {
          mode: 'ANY',
        },
      };
    }

    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_CHAT_MODEL,
        contents,
        config,
      });
    } catch (apiErr) {
      if (
        apiErr?.status === 503 ||
        apiErr?.status === 429 ||
        apiErr?.message?.includes('503') ||
        apiErr?.message?.includes('high demand')
      ) {
        await new Promise((r) => setTimeout(r, 1000));
        response = await ai.models.generateContent({
          model: GEMINI_CHAT_MODEL,
          contents,
          config,
        });
      } else {
        throw apiErr;
      }
    }

    const functionCalls = response.functionCalls;

    if (Array.isArray(functionCalls) && functionCalls.length > 0) {
      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) {
        contents.push(modelContent);
      }

      const functionResponseParts = [];

      for (const call of functionCalls) {
        if (shouldAbort?.()) break;

        onTool?.({ name: call.name, args: call.args || {} });

        const { result, sources } = await executeRagTool(
          call.name,
          call.args || {},
          { allowedDocIds, minScore }
        );

        toolExecutions.push({ name: call.name, args: call.args || {}, result });
        onToolResult?.({ name: call.name, result });

        if (Array.isArray(sources) && sources.length > 0) {
          collectedSources = mergeSources(collectedSources, sources);
          onSources?.(collectedSources, true);
        }

        // Sanitize result for model context (avoid stuffing 100KB+ base64 audio into Gemini tokens)
        const modelResult = { ...result };
        if (modelResult.dataUri) {
          modelResult.dataUri = '[audio/wav generated successfully]';
        }
        if (Array.isArray(modelResult.layers)) {
          modelResult.layers = modelResult.layers.map((l) => ({
            name: l.name,
            delay: l.delay,
            volume: l.volume,
            waveform: l.waveform,
            frequency: l.frequency,
            duration: l.duration,
            params: l.params,
          }));
        }

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response: modelResult,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
      continue;
    }

    // No tool calls -> Gemini produced the final answer
    finalReply = response.text || '';
    if (finalReply && onDelta) {
      onDelta(finalReply);
    }

    return {
      reply: finalReply,
      sources: collectedSources,
      grounded: collectedSources.length > 0,
      steps: step + 1,
      toolExecutions,
    };
  }

  // Fallback if maxSteps reached while still calling tools: stream final synthesis without tools
  if (!shouldAbort?.()) {
    const stream = await ai.models.generateContentStream({
      model: GEMINI_CHAT_MODEL,
      contents,
      config: { systemInstruction },
    });

    for await (const chunk of stream) {
      if (shouldAbort?.()) break;
      const text = chunk?.text || '';
      if (text) {
        finalReply += text;
        onDelta?.(text);
      }
    }
  }

  return {
    reply: finalReply,
    sources: collectedSources,
    grounded: collectedSources.length > 0,
    steps: maxSteps,
  };
}

module.exports = {
  runAgentChat,
};
