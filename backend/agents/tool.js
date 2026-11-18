const { Type } = require('@google/genai');
const { generateEmbedding } = require('../services/gemini.service');
const {
  searchSimilar,
  listAllDocuments,
  getDocumentDetails,
} = require('../services/pinecone.service');
const { synthesizeMathSfx, synthesizeLayeredSfx } = require('../utils/mathSfxSynth');
const { SFX_PRESETS, LAYERED_SFX_PRESETS } = require('./sfxPresetData');

/**
 * Gemini function declarations for Agentic RAG and Procedural SFX generation.
 */
const ragToolDeclarations = [
  {
    name: 'search_knowledge_base',
    description:
      'Search the Pinecone vector database for relevant document chunks using a semantic search query. Use this whenever the user asks a question that may be answered by uploaded documents.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'A clear, focused semantic search query optimized for vector retrieval.',
        },
        topK: {
          type: Type.INTEGER,
          description: 'Number of chunks to retrieve (1 to 10, default 4).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_documents',
    description:
      'List all documents currently indexed in the knowledge base, including their IDs, titles, and chunk counts.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_document_details',
    description:
      'Retrieve the full reconstructed text of a specific document using its base document ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        docId: {
          type: Type.STRING,
          description: 'The base document ID from list_documents or search results.',
        },
      },
      required: ['docId'],
    },
  },
  {
    name: 'search_sfx_presets',
    description:
      'Search curated mathematical sound design recipes (lasers, explosions, jumps, coins, shields, warps, hurts) to find starting parameters.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Keywords to search, e.g. "laser", "explosion", "coin", "jump", "teleport", "shield", "hurt".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'synthesize_math_sfx',
    description:
      'Synthesize a custom game sound effect using mathematical DSP equations (sine, square, sawtooth, triangle, noise, FM) with frequency slide, ADSR envelope, filter cutoff, distortion, and modulation. Returns a playable audio WAV dataUri and sets up the live editor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        soundName: {
          type: Type.STRING,
          description: 'A concise descriptive name for the sound, e.g. "8-Bit Laser Blast" or "Arcade Coin Chime".',
        },
        waveform: {
          type: Type.STRING,
          description: 'The base mathematical oscillator: "sine", "square", "sawtooth", "triangle", "noise", or "fm".',
        },
        frequency: {
          type: Type.NUMBER,
          description: 'Base frequency in Hertz (20 to 5000 Hz).',
        },
        freqSlide: {
          type: Type.NUMBER,
          description: 'Pitch slide rate in Hz/sec (e.g. -1500 for dropping laser, +1000 for rising jump, 0 for steady pitch).',
        },
        duration: {
          type: Type.NUMBER,
          description: 'Total duration in seconds (0.05 to 3.0s).',
        },
        attack: {
          type: Type.NUMBER,
          description: 'Attack time in seconds (0.001 to 1.0s).',
        },
        decay: {
          type: Type.NUMBER,
          description: 'Decay time in seconds (0.001 to 1.5s).',
        },
        sustain: {
          type: Type.NUMBER,
          description: 'Sustain amplitude volume level (0.0 to 1.0).',
        },
        release: {
          type: Type.NUMBER,
          description: 'Release time in seconds (0.001 to 2.0s).',
        },
        distortion: {
          type: Type.NUMBER,
          description: 'Soft clipping / overdrive distortion intensity (0.0 for clean to 1.0 for aggressive crunch).',
        },
        filterCutoff: {
          type: Type.NUMBER,
          description: 'Low-pass filter cutoff frequency in Hz (200 to 20000 Hz).',
        },
        bitCrush: {
          type: Type.NUMBER,
          description: 'Optional retro bit depth resolution (4, 6, 8, 12, or 16 for clean).',
        },
        vibratoRate: {
          type: Type.NUMBER,
          description: 'Vibrato speed in Hz (0 to 30 Hz).',
        },
        vibratoDepth: {
          type: Type.NUMBER,
          description: 'Vibrato pitch fluctuation intensity (0 to 100 Hz).',
        },
        reverb: {
          type: Type.NUMBER,
          description: 'Comb delay feedback resonance / echo (0.0 to 0.8).',
        },
      },
      required: ['waveform', 'frequency', 'duration'],
    },
  },
  {
    name: 'synthesize_layered_sfx',
    description:
      'Compose and synthesize a rich multi-layer game sound effect by mathematically combining multiple oscillator tracks (transient click, body tone sweep, sub rumble, noise wash, shimmer tail). Supports time delays for arpeggios/charge-ups, volume balances, and master distortion/reverb.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        soundName: {
          type: Type.STRING,
          description: 'Descriptive title for the composite sound (e.g. "Plasma Railgun Cannon", "Seismic Meteor Crash", "Dragon Flame Surge").',
        },
        layers: {
          type: Type.ARRAY,
          description: 'Array of 2 to 4 mathematical layers to mix.',
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Acoustic role/name (e.g. "Transient Hyper-Zap", "Core Plasma Punch", "Sub-Bass Shockwave").',
              },
              delay: {
                type: Type.NUMBER,
                description: 'Start time delay in seconds (0.0 for simultaneous hit, 0.05 to 0.5s for sequential chain/arpeggio).',
              },
              volume: {
                type: Type.NUMBER,
                description: 'Volume gain weight for this layer (0.1 to 1.5, default 1.0).',
              },
              waveform: {
                type: Type.STRING,
                description: 'Oscillator waveform: "sine", "square", "sawtooth", "triangle", "noise", or "fm".',
              },
              frequency: {
                type: Type.NUMBER,
                description: 'Base frequency in Hz (20 to 8000 Hz).',
              },
              freqSlide: {
                type: Type.NUMBER,
                description: 'Pitch slide in Hz/sec (e.g. -3500 for dropping laser, +1200 for rising jump/arpeggio).',
              },
              duration: {
                type: Type.NUMBER,
                description: 'Duration of this layer in seconds (0.05 to 3.0s).',
              },
              attack: { type: Type.NUMBER, description: 'Attack time (s).' },
              decay: { type: Type.NUMBER, description: 'Decay time (s).' },
              sustain: { type: Type.NUMBER, description: 'Sustain level (0 to 1).' },
              release: { type: Type.NUMBER, description: 'Release time (s).' },
              distortion: { type: Type.NUMBER, description: 'Overdrive distortion (0 to 1).' },
              filterCutoff: { type: Type.NUMBER, description: 'Lowpass filter cutoff in Hz (100 to 20000).' },
              bitCrush: { type: Type.NUMBER, description: 'Bit depth (4 to 16).' },
              vibratoRate: { type: Type.NUMBER, description: 'Vibrato rate (Hz).' },
              vibratoDepth: { type: Type.NUMBER, description: 'Vibrato depth (Hz).' },
              modFrequency: { type: Type.NUMBER, description: 'FM modulator freq (Hz).' },
              modDepth: { type: Type.NUMBER, description: 'FM depth.' },
              reverb: { type: Type.NUMBER, description: 'Comb reverb (0 to 0.8).' },
            },
            required: ['name', 'waveform', 'frequency', 'duration'],
          },
        },
        masterDistortion: {
          type: Type.NUMBER,
          description: 'Master bus saturation/overdrive (0.0 to 1.0).',
        },
        masterFilter: {
          type: Type.NUMBER,
          description: 'Master bus low-pass filter cutoff in Hz (100 to 20000).',
        },
        masterReverb: {
          type: Type.NUMBER,
          description: 'Master space/echo reverb level (0.0 to 0.8).',
        },
      },
      required: ['soundName', 'layers'],
    },
  },
  {
    name: 'blend_sfx_presets',
    description:
      'Mathematically fuse and morph two or more existing SFX presets together (e.g. blend a laser blaster transient with a deep explosion body and comb reverb) into a brand new solution.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        soundName: {
          type: Type.STRING,
          description: 'Name of the fused composite sound effect.',
        },
        presetIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of preset IDs to blend (e.g. ["laser-blaster", "deep-explosion"]).',
        },
        balance: {
          type: Type.STRING,
          description: '"parallel" (play together), "sequential" (chain in time), or "transient_body" (first as sharp click, second as decaying body).',
        },
      },
      required: ['soundName', 'presetIds'],
    },
  },
];

/**
 * Execute a single RAG tool call while enforcing allowedDocIds and minScore.
 */
async function executeRagTool(name, args = {}, context = {}) {
  const { allowedDocIds, minScore } = context;
  const isScoped = Array.isArray(allowedDocIds) && allowedDocIds.length > 0;

  if (name === 'search_knowledge_base') {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { result: { error: 'query is required' }, sources: [] };
    }

    const parsedTopK = Number(args.topK);
    const topK =
      Number.isFinite(parsedTopK) && parsedTopK >= 1 && parsedTopK <= 10
        ? Math.floor(parsedTopK)
        : 4;

    const vector = await generateEmbedding(query);
    const sources = await searchSimilar({
      vector,
      topK,
      ...(minScore !== undefined ? { minScore } : {}),
      ...(isScoped ? { allowedDocIds } : {}),
    });

    return {
      sources,
      result: {
        matchCount: sources.length,
        chunks: sources.map((s) => ({
          source: s.metadata?.title || s.id,
          id: s.id,
          score: Number((s.score ?? 0).toFixed(4)),
          docId: s.metadata?.docId || String(s.id).replace(/-\d+$/, ''),
          text: s.metadata?.text || '',
        })),
      },
    };
  }

  if (name === 'list_documents') {
    const { documents = [] } = await listAllDocuments();
    const filtered = isScoped
      ? documents.filter((d) => allowedDocIds.includes(d.id))
      : documents;

    return {
      sources: [],
      result: {
        count: filtered.length,
        documents: filtered.map((d) => ({
          id: d.id,
          title: d.title,
          chunksCount: d.chunksCount,
          originalname: d.originalname || null,
        })),
      },
    };
  }

  if (name === 'get_document_details') {
    const docId = typeof args.docId === 'string' ? args.docId.trim() : '';
    if (!docId) {
      return { result: { error: 'docId is required' }, sources: [] };
    }

    if (isScoped && !allowedDocIds.includes(docId)) {
      return {
        sources: [],
        result: {
          error: `Access denied: document "${docId}" is outside the selected knowledge scope.`,
        },
      };
    }

    const details = await getDocumentDetails(docId);
    if (!details) {
      return {
        sources: [],
        result: { error: `Document "${docId}" not found.` },
      };
    }

    return {
      sources: [],
      result: {
        id: details.id,
        title: details.title,
        chunksCount: details.chunksCount,
        fullText: details.fullText,
      },
    };
  }

  if (name === 'search_sfx_presets') {
    const q = String(args.query || '').toLowerCase().trim();
    const matches = SFX_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
    const layeredMatches = LAYERED_SFX_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
    const chosen = matches.length > 0 ? matches : SFX_PRESETS.slice(0, 3);
    const chosenLayered =
      layeredMatches.length > 0 ? layeredMatches : LAYERED_SFX_PRESETS.slice(0, 2);

    return {
      sources: [],
      result: {
        count: chosen.length + chosenLayered.length,
        presets: chosen.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          params: p.params,
        })),
        layeredArchetypes: chosenLayered.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          description: p.description,
          layers: p.layers,
          masterEffects: p.masterEffects,
        })),
      },
    };
  }

  if (name === 'synthesize_math_sfx') {
    try {
      const soundResult = synthesizeMathSfx(args);
      return {
        sources: [],
        result: {
          ok: true,
          soundName: args.soundName || `${args.waveform || 'synth'} effect`,
          duration: soundResult.duration,
          waveform: soundResult.waveform,
          dataUri: soundResult.dataUri,
          byteSize: soundResult.byteSize,
          params: soundResult.params,
        },
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `Synthesis failed: ${err.message}` },
      };
    }
  }

  if (name === 'synthesize_layered_sfx') {
    try {
      const result = synthesizeLayeredSfx({
        soundName: args.soundName,
        layers: args.layers,
        masterDistortion: args.masterDistortion,
        masterFilter: args.masterFilter,
        masterReverb: args.masterReverb,
      });
      return {
        sources: [],
        result: {
          ok: true,
          isLayered: true,
          soundName: result.soundName,
          duration: result.duration,
          dataUri: result.dataUri,
          byteSize: result.byteSize,
          layerCount: result.layerCount,
          layers: result.layers,
          masterEffects: result.masterEffects,
        },
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `Layered synthesis failed: ${err.message}` },
      };
    }
  }

  if (name === 'blend_sfx_presets') {
    try {
      const pIds = Array.isArray(args.presetIds) ? args.presetIds : [];
      const matched = [];
      for (const id of pIds) {
        const found = SFX_PRESETS.find(
          (p) =>
            p.id === id ||
            p.name.toLowerCase().includes(String(id).toLowerCase())
        );
        if (found) matched.push(found);
      }
      if (matched.length === 0) {
        matched.push(SFX_PRESETS[0], SFX_PRESETS[3]); // Default: Laser + Explosion
      }
      const balance = args.balance || 'parallel';
      const layers = matched.map((preset, idx) => {
        let delay = 0;
        let volume = 1.0;
        const layerParams = { ...preset.params };
        if (balance === 'sequential') {
          delay = idx * 0.18;
        } else if (balance === 'transient_body') {
          if (idx === 0) {
            layerParams.attack = 0.002;
            layerParams.decay = 0.05;
            layerParams.sustain = 0.05;
            layerParams.duration = Math.min(layerParams.duration, 0.12);
            volume = 1.1;
          } else {
            delay = 0.04;
            layerParams.decay = Math.max(layerParams.decay, 0.25);
            volume = 0.85;
          }
        }
        return {
          name: `${preset.name} (${balance === 'transient_body' && idx === 0 ? 'Transient' : 'Body'})`,
          delay,
          volume,
          params: layerParams,
        };
      });

      const result = synthesizeLayeredSfx({
        soundName: args.soundName || `Fused ${matched.map((m) => m.name).join(' + ')}`,
        layers,
        masterDistortion: 0.1,
        masterReverb: 0.2,
      });

      return {
        sources: [],
        result: {
          ok: true,
          isLayered: true,
          soundName: result.soundName,
          duration: result.duration,
          dataUri: result.dataUri,
          byteSize: result.byteSize,
          layerCount: result.layerCount,
          layers: result.layers,
          masterEffects: result.masterEffects,
        },
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `Blend failed: ${err.message}` },
      };
    }
  }

  return {
    sources: [],
    result: { error: `Unknown tool: ${name}` },
  };
}

module.exports = {
  ragToolDeclarations,
  executeRagTool,
};
