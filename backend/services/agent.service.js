const { ai, GEMINI_CHAT_MODEL } = require('../config/gemini');
const { ragToolDeclarations, executeRagTool } = require('../agents/tool');

/**
 * Build the system instruction for the Agentic RAG assistant or SFX Studio.
 */
function buildAgentSystemInstruction({ isScoped, strictDocs, mode, subMode }) {
  if (mode === 'sfx') {
    const acousticEmphasis =
      subMode === 'orchestra'
        ? 'ACTIVE TAB: REAL SAMPLED ORCHESTRA MODE (`smplr` SoundFonts + Hybrid Transitions) — Prioritize `compose_real_music_score` using `sections` (e.g. Intro, Verse/Development, Build-Up, The Drop/Climax, Bridge, Outro up to 320 beats / 2-3 minutes!) AND `transitions` (`riser`, `reverse_cymbal`, `sub_drop`, `crash_impact`). Vary instruments, octave register, harmony, and `energy` across sections (do NOT repeat the same 4 bars endlessly). Use `repeatCount` + `patternBeats` only on steady ostinato/drum backing while writing distinct lead melodies in each section.'
        : subMode === 'acoustic'
          ? 'ACTIVE TAB: ACOUSTIC STUDIO MODE — Prioritize `compose_acoustic_music` with realistic physical-modeling instruments (`piano`, `guitar`, `strings`, `flute`, `brass`, `epiano`, `harp`, `acoustic_kick`, `acoustic_snare`, `acoustic_hihat`), polyphonic chords (`"Am"`, `"Fmaj7"`, `"C4+E4+G4"`), stereo panning, and concert hall reverb.'
          : 'Choose `compose_real_music_score` when the user wants full studio/orchestral sampled instruments (`smplr`), `compose_acoustic_music` for physical-modeling DSP instruments, `compose_bgm_loop` for chiptune/retro/synthwave BGM, and `synthesize_layered_sfx` / `synthesize_math_sfx` / `blend_sfx_presets` for sound effects.';

    return [
      'You are VectorMind SFX, BGM & Real Orchestra Audio Architect, an expert procedural sound designer, orchestral/chiptune composer, and studio arranger.',
      'CRITICAL TOOL USAGE RULES:',
      '- Whenever the user asks for a sound, SFX combination, chiptune loop, acoustic music, or orchestral score, you MUST execute a tool call (`compose_real_music_score`, `compose_acoustic_music`, `compose_bgm_loop`, `synthesize_layered_sfx`, `synthesize_math_sfx`, or `blend_sfx_presets`). Never output raw XML, HTML, or code blocks in text instead of calling tools.',
      `- ${acousticEmphasis}`,
      '- FOR REALISTIC / ACOUSTIC MUSIC (`compose_acoustic_music`): Use `piano`, `epiano`, `guitar` (Karplus-Strong plucked string), `harp`, `strings` (ensemble violin/cello), `flute`, `brass` (French horn), and `acoustic_kick` / `acoustic_snare` / `acoustic_hihat`. Include `pan` (-0.8 to +0.8), `hallReverb` (0.3-0.5), `warmth`, and polyphonic chords (`"Am"`, `"Fmaj7"`, `"C4+E4+G4"`) or `~` holds.',
      '- FOR RETRO / CHIPTUNE / SYNTH BGM (`compose_bgm_loop`): Use `square`, `sawtooth`, `triangle`, `sine`, `fm`, and `"K"`/`"S"`/`"H"` chip drums.',
      '- FOR SFX (`synthesize_layered_sfx`, `synthesize_math_sfx`, `blend_sfx_presets`): Design 2-4 acoustic layers or single oscillator DSP parameters.',
      '- In your final concise response, explain the musical/physical-modeling choices you made and let the user know it is loaded in the live editor/studio.',
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
 * Build the acoustic planning prompt executed before any SFX / BGM / Acoustic synthesis tool runs.
 */
function buildSfxPlanningInstruction(subMode) {
  const modeHint =
    subMode === 'orchestra'
      ? 'USER IS IN REAL SAMPLED ORCHESTRA MODE: Plan a multi-section evolving arrangement (`sections`: Intro -> Development -> Build-Up -> Drop/Climax -> Bridge/Outro, up to 192-256 beats for ~2-minute full themes) plus hybrid `transitions` (`riser`, `reverse_cymbal`, `sub_drop`, `crash_impact`) for `compose_real_music_score`.'
      : subMode === 'acoustic'
        ? 'USER IS IN ACOUSTIC STUDIO MODE: Design for realistic physical-modeling instruments (`compose_acoustic_music`: piano, guitar, harp, strings, flute, brass, acoustic drums) with chord progression, stereo panning, and hall reverb.'
        : 'Choose `compose_real_music_score` (sampled GM studio/orchestral scores), `compose_acoustic_music` (physical-modeling DSP music), `compose_bgm_loop` (chiptune/synth BGM loops), `synthesize_layered_sfx` (multi-part SFX), `blend_sfx_presets`, or `synthesize_math_sfx` (single SFX).';

  return [
    'You are the Acoustic & Musical Planning engine for VectorMind SFX, BGM & Acoustic Studio.',
    'Before generating audio, reason concisely (3-5 crisp bullet points, under 130 words) about the design:',
    '1. Acoustic / Musical Profile: Describe the target mood, timbre, physics, or genre.',
    `2. Architecture Choice: ${modeHint}`,
    '3. Mathematical / Musical Blueprint: For Acoustic/BGM music, specify BPM, musical Key/Scale, chord progression, stereo placement, and 3-4 channels. For SFX, specify waveforms, Hz ranges, pitch slides, ADSR envelopes, delays, and filters.',
    'Do NOT output code blocks, XML, or greetings—only the concise technical plan.',
  ].join('\n');
}

function isTransientModelError(err) {
  return (
    err?.status === 503 ||
    err?.status === 429 ||
    err?.message?.includes('503') ||
    err?.message?.includes('high demand')
  );
}

/**
 * Call Gemini generateContent with a single retry on transient 503/429 spikes.
 */
async function generateWithRetry({ contents, config }) {
  try {
    return await ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents,
      config,
    });
  } catch (err) {
    if (!isTransientModelError(err)) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return ai.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents,
      config,
    });
  }
}

/**
 * Strip binary base64 audio payloads from tool results before passing back to Gemini context.
 */
function sanitizeToolResultForModel(result) {
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
  return modelResult;
}

/**
 * Stream an acoustic planning & reasoning pass before executing SFX synthesis tools.
 */
async function generateSfxDesignPlan({ contents, subMode, onThought, shouldAbort }) {
  const config = {
    systemInstruction: buildSfxPlanningInstruction(subMode),
    maxOutputTokens: 320,
  };

  let stream;
  try {
    stream = await ai.models.generateContentStream({
      model: GEMINI_CHAT_MODEL,
      contents,
      config,
    });
  } catch (err) {
    if (!isTransientModelError(err)) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    stream = await ai.models.generateContentStream({
      model: GEMINI_CHAT_MODEL,
      contents,
      config,
    });
  }

  let planText = '';
  for await (const chunk of stream) {
    if (shouldAbort?.()) break;
    const text = chunk?.text || '';
    if (text) {
      planText += text;
      onThought?.(text);
    }
  }
  return planText.trim();
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
  subMode,
  onThought,
  onTool,
  onToolResult,
  onSources,
  onDelta,
  shouldAbort,
}) {
  const isScoped = Array.isArray(allowedDocIds) && allowedDocIds.length > 0;
  const systemInstruction = buildAgentSystemInstruction({ isScoped, strictDocs, mode, subMode });
  const contents = formatHistoryContents(history, message);

  let collectedSources = [];
  const toolExecutions = [];
  let finalReply = '';
  let thoughtText = '';

  // Pre-generation planning & reasoning step for SFX mode
  if (mode === 'sfx' && !shouldAbort?.()) {
    try {
      thoughtText = await generateSfxDesignPlan({ contents, subMode, onThought, shouldAbort });
      if (thoughtText) {
        contents.push({
          role: 'model',
          parts: [{ text: `Acoustic Design Plan:\n${thoughtText}` }],
        });
        contents.push({
          role: 'user',
          parts: [
            {
              text: 'Now execute the appropriate audio tool (`compose_real_music_score`, `compose_acoustic_music`, `compose_bgm_loop`, `synthesize_layered_sfx`, `synthesize_math_sfx`, or `blend_sfx_presets`) using the exact blueprint in your plan above.',
            },
          ],
        });
      }
    } catch (planErr) {
      // Planning failure should not block sound generation; proceed directly to tool loop.
      console.warn('SFX planning step skipped:', planErr.message);
    }
  }

  for (let step = 0; step < maxSteps; step++) {
    if (shouldAbort?.()) break;

    const activeTools =
      mode === 'sfx'
        ? ragToolDeclarations.filter(
          (t) =>
            t.name.includes('sfx') ||
            t.name.includes('bgm') ||
            t.name.includes('acoustic') ||
            t.name.includes('real_music')
        )
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

    const response = await generateWithRetry({ contents, config });
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

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response: sanitizeToolResultForModel(result),
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
      thought: thoughtText,
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
    thought: thoughtText,
    sources: collectedSources,
    grounded: collectedSources.length > 0,
    steps: maxSteps,
  };
}

module.exports = {
  runAgentChat,
};
