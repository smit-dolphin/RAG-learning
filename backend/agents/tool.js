const { Type } = require('@google/genai');
const { generateEmbedding } = require('../services/gemini.service');
const {
  searchSimilar,
  listAllDocuments,
  getDocumentDetails,
} = require('../services/pinecone.service');
const {
  synthesizeMathSfx,
  synthesizeLayeredSfx,
  composeBgmLoop,
  composeAcousticMusic,
  parseStepFrequencies,
} = require('../utils/mathSfxSynth');
const {
  SFX_PRESETS,
  LAYERED_SFX_PRESETS,
  BGM_PRESETS,
  ACOUSTIC_MUSIC_PRESETS,
  ORCHESTRA_PRESETS,
} = require('./sfxPresetData');

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
  {
    name: 'compose_bgm_loop',
    description:
      'Compose a multi-channel looping game background music (BGM) track from musical step-sequencer patterns. Supports melody leads, basslines, arpeggios, pads, and drum grooves ("K" kick, "S" snare, "H" hi-hat) rendered into a seamless WAV loop.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        songName: {
          type: Type.STRING,
          description: 'Descriptive title for the track (e.g. "Neon Boss Battle", "Cozy Forest Theme").',
        },
        bpm: {
          type: Type.NUMBER,
          description: 'Tempo in beats per minute (70 to 180 BPM).',
        },
        key: {
          type: Type.STRING,
          description: 'Musical key & mode (e.g. "C Major", "D Minor", "A Minor").',
        },
        stepCount: {
          type: Type.INTEGER,
          description: 'Number of 16th-note steps per loop pattern (16 or 32, default 32).',
        },
        loops: {
          type: Type.INTEGER,
          description: 'How many times the pattern repeats in the WAV file (1 to 4, default 2).',
        },
        channels: {
          type: Type.ARRAY,
          description: 'Array of 2 to 5 instrument channels (e.g. Lead, Arp, Bass, Percussion).',
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Channel name (e.g. "Pulse Lead", "Saw Bass", "Chip Drums").',
              },
              instrument: {
                type: Type.STRING,
                description: 'Synth or drum instrument: "square", "sawtooth", "triangle", "sine", "fm", "noise", "kick", "snare", or "hihat".',
              },
              volume: {
                type: Type.NUMBER,
                description: 'Track mix volume (0.1 to 1.2).',
              },
              filterCutoff: {
                type: Type.NUMBER,
                description: 'Low-pass filter cutoff in Hz (e.g. 1200 for deep bass, 11000 for crisp lead).',
              },
              distortion: {
                type: Type.NUMBER,
                description: 'Channel overdrive distortion (0.0 to 1.0).',
              },
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Array of length `stepCount` (16 or 32). Use scientific pitch notes like "C4", "Eb5", "F#3", "~" to sustain previous note, "-" for rest, or "K", "S", "H" for kick/snare/hi-hat hits.',
              },
            },
            required: ['name', 'instrument', 'steps'],
          },
        },
        masterReverb: {
          type: Type.NUMBER,
          description: 'Master space reverb (0.0 to 0.7).',
        },
        masterDistortion: {
          type: Type.NUMBER,
          description: 'Master saturation (0.0 to 0.6).',
        },
        masterFilter: {
          type: Type.NUMBER,
          description: 'Master low-pass cutoff in Hz (500 to 20000).',
        },
      },
      required: ['songName', 'bpm', 'channels'],
    },
  },
  {
    name: 'compose_acoustic_music',
    description:
      'Compose realistic physical-modeling stereo acoustic music (NOT chiptune) using grand piano, Karplus-Strong plucked acoustic guitar/harp, bowed string ensemble, concert flute, French horn brass, Rhodes e-piano, and acoustic studio drums with polyphonic chords, stereo panning, concert hall reverb, and multi-section arrangements.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        songName: {
          type: Type.STRING,
          description: 'Descriptive composition title (e.g. "Moonlit Piano & Strings Ballad", "Campfire Guitar & Flute").',
        },
        bpm: {
          type: Type.NUMBER,
          description: 'Tempo in beats per minute (55 to 180 BPM).',
        },
        key: {
          type: Type.STRING,
          description: 'Musical key & mode (e.g. "A Minor", "G Major", "D Minor").',
        },
        stepCount: {
          type: Type.INTEGER,
          description: 'Steps per bar pattern (16 or 32, default 32).',
        },
        loops: {
          type: Type.INTEGER,
          description: 'Repeats per pattern (1 to 4, default 2).',
        },
        hallReverb: {
          type: Type.NUMBER,
          description: 'Stereo concert hall reverb wet amount (0.15 to 0.7, default 0.38).',
        },
        warmth: {
          type: Type.NUMBER,
          description: 'Analog harmonic warmth saturation (0.0 to 0.5, default 0.2).',
        },
        channels: {
          type: Type.ARRAY,
          description: 'Array of 2 to 5 acoustic instrument tracks.',
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Instrument track label (e.g. "Grand Piano", "Acoustic Guitar", "String Ensemble", "Concert Flute", "Studio Kit").',
              },
              instrument: {
                type: Type.STRING,
                description: 'Physical-modeling acoustic instrument: "piano", "epiano", "guitar", "harp", "strings", "flute", "brass", "acoustic_kick", "acoustic_snare", or "acoustic_hihat".',
              },
              volume: {
                type: Type.NUMBER,
                description: 'Mix volume (0.1 to 1.3).',
              },
              pan: {
                type: Type.NUMBER,
                description: 'Stereo pan position (-0.8 left to 0.0 center to +0.8 right).',
              },
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Array of length `stepCount` (16 or 32). Supports single notes ("E5", "A3"), polyphonic stacked chords ("C4+E4+G4"), named chord symbols ("Am", "Fmaj7", "G7", "Dm"), "~" to sustain/hold, "-" for rest, and "K"/"S"/"H" for acoustic kick/snare/hi-hat.',
              },
            },
            required: ['name', 'instrument', 'steps'],
          },
        },
      },
      required: ['songName', 'bpm', 'channels'],
    },
  },
  {
    name: 'compose_real_music_score',
    description:
      'Compose studio-sampled multi-instrument music played by the browser `smplr` SoundFont & Steinway engine. Supports real recorded Steinway Grand Piano (`SplendidGrandPiano`), `cello`, `violin`, `viola`, `string_ensemble_1`, `tremolo_strings`, `pizzicato_strings`, `orchestral_harp`, `church_organ`, `harpsichord`, `choir_aahs`, `flute`, `oboe`, `bassoon`, `french_horn`, `trumpet`, `acoustic_guitar_nylon`, `acoustic_guitar_steel`, `electric_piano_1`, `acoustic_bass`, `marimba`, `timpani`, and `TR-808` drums with expressive beat timing and velocity dynamics.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        songName: {
          type: Type.STRING,
          description: 'Title of the orchestral/band composition (e.g. "Hallownest Lament", "Sanctum Organ Fugue").',
        },
        bpm: {
          type: Type.NUMBER,
          description: 'Tempo in beats per minute (50 to 190 BPM).',
        },
        key: {
          type: Type.STRING,
          description: 'Musical key & mode (e.g. "D Minor", "C Minor", "E Minor", "G Major").',
        },
        reverb: {
          type: Type.NUMBER,
          description: 'Concert hall reverb wet mix (0.0 to 0.75, default 0.42).',
        },
        totalBeats: {
          type: Type.INTEGER,
          description: 'Total length in beats (16 = 4 bars, 64 = 16 bars, 192-256 = full 2-minute evolving arrangement, max 320).',
        },
        sections: {
          type: Type.ARRAY,
          description:
            'Recommended for full 1-to-3 minute non-repetitive themes: sequential song sections (e.g., "Intro", "Verse A", "Build-Up", "The Drop", "Bridge", "Outro"). Each section places its tracks at its beat offset and modulates dynamics.',
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Section label (e.g. "1. Piano Intro", "3. Riser Build-Up", "4. Cathedral Drop").',
              },
              startBeat: {
                type: Type.NUMBER,
                description: 'Optional beat offset; auto-stacked sequentially after the previous section if omitted.',
              },
              lengthBeats: {
                type: Type.NUMBER,
                description: 'Duration of this section in beats (e.g. 16, 24, 32, 48, 64).',
              },
              energy: {
                type: Type.NUMBER,
                description: 'Dynamic loudness multiplier for this section (0.45 delicate intro to 1.2 forte climax).',
              },
              tracks: {
                type: Type.ARRAY,
                description: 'Instruments active in this section with beat offsets relative to section start (0..lengthBeats).',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    instrument: { type: Type.STRING },
                    volume: { type: Type.NUMBER },
                    pan: { type: Type.NUMBER },
                    repeatCount: {
                      type: Type.INTEGER,
                      description: 'Optional repeat count (1-8) for rhythmic ostinato/drum patterns over patternBeats while melody tracks evolve freely.',
                    },
                    patternBeats: {
                      type: Type.NUMBER,
                      description: 'Loop stride in beats when repeatCount > 1 (e.g. 4, 8, or 16).',
                    },
                    notes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          beat: { type: Type.NUMBER },
                          note: { type: Type.STRING },
                          durationBeats: { type: Type.NUMBER },
                          velocity: { type: Type.INTEGER },
                        },
                        required: ['beat', 'note', 'durationBeats'],
                      },
                    },
                  },
                  required: ['name', 'instrument', 'notes'],
                },
              },
            },
            required: ['name', 'lengthBeats', 'tracks'],
          },
        },
        transitions: {
          type: Type.ARRAY,
          description:
            'Hybrid Web Audio sweeps and cinematic impacts synchronized with `smplr` beats for real build-ups and drops.',
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ['riser', 'reverse_cymbal', 'sub_drop', 'crash_impact'],
                description: 'riser (filtered noise + synth sweep upward), reverse_cymbal (metallic crescendo into drop), sub_drop (808 bass dive on drop beat), crash_impact (boom + shimmer hit).',
              },
              beat: {
                type: Type.NUMBER,
                description: 'Beat where the transition starts (risers/reverse_cymbals peak at beat + durationBeats).',
              },
              durationBeats: {
                type: Type.NUMBER,
                description: 'Sweep/decay length in beats (e.g. 8 or 16 for a build riser, 4 for sub_drop).',
              },
              intensity: {
                type: Type.NUMBER,
                description: 'Mix intensity 0.2 to 1.0.',
              },
            },
            required: ['type', 'beat', 'durationBeats'],
          },
        },
        tracks: {
          type: Type.ARRAY,
          description: 'Flat track array (use for short cues or when not using `sections`).',
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Human-readable track name (e.g. "Steinway Grand Piano", "Solo Cello").',
              },
              instrument: {
                type: Type.STRING,
                description: 'Exact `smplr` instrument ID: "SplendidGrandPiano", "cello", "violin", "viola", "string_ensemble_1", "tremolo_strings", "pizzicato_strings", "orchestral_harp", "church_organ", "harpsichord", "choir_aahs", "flute", "oboe", "bassoon", "french_horn", "trumpet", "acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_piano_1", "acoustic_bass", "marimba", "timpani", or "TR-808".',
              },
              volume: {
                type: Type.NUMBER,
                description: 'Track volume multiplier (0.2 to 1.2).',
              },
              pan: {
                type: Type.NUMBER,
                description: 'Stereo pan (-0.8 left to 0.0 center to +0.8 right).',
              },
              notes: {
                type: Type.ARRAY,
                description: 'Expressive timed note events on beat positions.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    beat: {
                      type: Type.NUMBER,
                      description: 'Beat offset starting at 0 (e.g. 0, 0.5, 1, 1.5, ..., up to totalBeats).',
                    },
                    note: {
                      type: Type.STRING,
                      description: 'Pitch or chord ("D4", "F#5", "D4+F4+A4", "Dm", "Am7"), or drum alias for TR-808 ("kick", "snare", "hihat-closed", "hihat-open").',
                    },
                    durationBeats: {
                      type: Type.NUMBER,
                      description: 'Duration in beats (e.g. 0.5, 1.0, 2.0, 3.8).',
                    },
                    velocity: {
                      type: Type.INTEGER,
                      description: 'Expression dynamics 20-120 (soft 55-70, medium 75-90, forte 95-115).',
                    },
                  },
                  required: ['beat', 'note', 'durationBeats'],
                },
              },
            },
            required: ['name', 'instrument', 'notes'],
          },
        },
      },
      required: ['songName', 'bpm'],
    },
  },
];

const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function freqToPitchName(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const clamped = Math.max(21, Math.min(108, midi));
  const octave = Math.floor(clamped / 12) - 1;
  return `${PITCH_NAMES[clamped % 12]}${octave}`;
}

const VALID_TRANSITION_TYPES = new Set(['riser', 'reverse_cymbal', 'sub_drop', 'crash_impact']);

function expandOrchestraNotes(rawNotes, beatSec, beatOffset, energyScale, isDrumKit, repeatCount = 1, patternBeats = 0) {
  const expanded = [];
  const safeRepeat = Math.min(Math.max(Math.round(Number(repeatCount) || 1), 1), 12);
  let inferredSpan = 0;
  for (const ev of rawNotes) {
    if (!ev) continue;
    const bEnd = (Number(ev.beat) || 0) + (Number(ev.durationBeats) || 0.5);
    if (bEnd > inferredSpan) inferredSpan = bEnd;
  }
  const stride = Number(patternBeats) > 0 ? Number(patternBeats) : Math.max(4, Math.ceil(inferredSpan));

  for (let rep = 0; rep < safeRepeat; rep++) {
    const repOffset = beatOffset + rep * stride;
    for (const ev of rawNotes) {
      if (!ev || ev.note === undefined || ev.note === null) continue;
      const beat = Math.max(0, repOffset + (Number(ev.beat) || 0));
      if (beat >= 320) continue;
      const durationBeats = Math.min(Math.max(Number(ev.durationBeats) || 0.5, 0.1), 16);
      const rawVel = Number(ev.velocity ?? 82) * energyScale;
      const velocity = Math.min(Math.max(Math.round(rawVel), 20), 127);

      const rawToken = String(ev.note).trim();
      if (!rawToken || rawToken === '-' || rawToken === 'rest') continue;

      if (isDrumKit) {
        expanded.push({
          beat,
          durationBeats,
          time: beat * beatSec,
          duration: durationBeats * beatSec,
          note: rawToken,
          velocity,
        });
        continue;
      }

      if (/^[A-Ga-g][#b]?-?\d$/.test(rawToken)) {
        expanded.push({
          beat,
          durationBeats,
          time: beat * beatSec,
          duration: durationBeats * beatSec,
          note: rawToken,
          velocity,
        });
      } else if (rawToken.includes('+') || rawToken.includes('/')) {
        for (const part of rawToken.split(/[+/]/)) {
          const cleaned = part.trim();
          if (cleaned) {
            expanded.push({
              beat,
              durationBeats,
              time: beat * beatSec,
              duration: durationBeats * beatSec,
              note: cleaned,
              velocity,
            });
          }
        }
      } else {
        const freqs = parseStepFrequencies(rawToken);
        for (const f of freqs) {
          expanded.push({
            beat,
            durationBeats,
            time: beat * beatSec,
            duration: durationBeats * beatSec,
            note: freqToPitchName(f),
            velocity,
          });
        }
      }
    }
  }
  return expanded;
}

/**
 * Validate and normalize an AI-authored musical score (supports flat tracks AND multi-section 2-3 min arrangements + transitions).
 */
function buildRealMusicScore(args = {}) {
  const bpm = Math.min(Math.max(Number(args.bpm) || 90, 45), 195);
  const beatSec = 60 / bpm;
  const reverb = Math.min(Math.max(Number(args.reverb ?? 0.42), 0), 0.75);
  const MAX_BEATS = 320;
  let maxEndBeat = Math.min(Math.max(Number(args.totalBeats) || 16, 8), MAX_BEATS);

  const trackMap = new Map();
  const upsertTrackEvents = (tr, beatOffset, energyScale) => {
    const instrument = String(tr.instrument || 'SplendidGrandPiano').trim();
    const isDrumKit = /tr-808|casio|lm-2|mfb|roland/i.test(instrument);
    const volume = Math.min(Math.max(Number(tr.volume ?? 0.85), 0.1), 1.3);
    const pan = Math.min(Math.max(Number(tr.pan ?? 0), -0.9), 0.9);
    const trackName = String(tr.name || instrument).trim();
    const rawNotes = Array.isArray(tr.notes) ? tr.notes : [];

    const events = expandOrchestraNotes(
      rawNotes,
      beatSec,
      beatOffset,
      energyScale,
      isDrumKit,
      tr.repeatCount,
      tr.patternBeats
    );

    for (const ev of events) {
      const endBeat = ev.beat + ev.durationBeats;
      if (endBeat > maxEndBeat && endBeat <= MAX_BEATS) {
        maxEndBeat = Math.ceil(endBeat);
      }
    }

    const key = `${instrument}::${trackName.toLowerCase()}`;
    if (!trackMap.has(key)) {
      trackMap.set(key, {
        id: tr.id || `orch-tr-${trackMap.size + 1}-${Date.now().toString(36)}`,
        name: trackName,
        instrument,
        volume,
        pan,
        muted: false,
        notes: [],
      });
    }
    trackMap.get(key).notes.push(...events);
  };

  // 1. Optional flat tracks array (beat offset 0)
  const rawTracks = Array.isArray(args.tracks) ? args.tracks : [];
  for (const tr of rawTracks) {
    upsertTrackEvents(tr, 0, 1.0);
  }

  // 2. Optional sequential song sections (Intro -> Build -> Drop -> Bridge -> Outro)
  const rawSections = Array.isArray(args.sections) ? args.sections : [];
  const normalizedSections = [];
  let cursorBeat = 0;

  for (let sIdx = 0; sIdx < rawSections.length; sIdx++) {
    const sec = rawSections[sIdx];
    if (!sec) continue;
    const startBeat =
      sec.startBeat !== undefined && sec.startBeat !== null
        ? Math.max(0, Number(sec.startBeat) || 0)
        : cursorBeat;
    const lengthBeats = Math.min(Math.max(Number(sec.lengthBeats) || 16, 4), 96);
    const endBeat = Math.min(MAX_BEATS, startBeat + lengthBeats);
    const energy = Math.min(Math.max(Number(sec.energy ?? 1.0), 0.35), 1.3);

    if (endBeat > maxEndBeat && endBeat <= MAX_BEATS) {
      maxEndBeat = Math.ceil(endBeat);
    }

    const secTracks = Array.isArray(sec.tracks) ? sec.tracks : [];
    for (const tr of secTracks) {
      upsertTrackEvents(tr, startBeat, energy);
    }

    normalizedSections.push({
      name: String(sec.name || `Section ${sIdx + 1}`).trim(),
      startBeat,
      endBeat,
      energy,
    });
    cursorBeat = endBeat;
  }

  // Sort notes chronologically per track
  const tracks = Array.from(trackMap.values()).map((tr) => ({
    ...tr,
    notes: tr.notes.sort((a, b) => a.beat - b.beat),
  }));

  // 3. Hybrid Web Audio transitions (risers, sub_drops, reverse_cymbals, crash_impacts)
  const rawTransitions = Array.isArray(args.transitions) ? args.transitions : [];
  const transitions = rawTransitions
    .filter((t) => t && VALID_TRANSITION_TYPES.has(String(t.type || '').trim()))
    .map((t) => {
      const beat = Math.min(MAX_BEATS, Math.max(0, Number(t.beat) || 0));
      const durationBeats = Math.min(Math.max(Number(t.durationBeats) || 4, 0.5), 24);
      const intensity = Math.min(Math.max(Number(t.intensity ?? 0.75), 0.15), 1.0);
      return {
        type: String(t.type).trim(),
        beat,
        durationBeats,
        intensity,
      };
    });

  const totalDuration = Math.max(maxEndBeat * beatSec, 2.0);

  return {
    ok: true,
    isRealOrchestra: true,
    songName: args.songName || args.name || 'Orchestral Score',
    bpm,
    key: args.key || 'D Minor',
    reverb,
    totalBeats: maxEndBeat,
    totalDuration,
    sections: normalizedSections,
    transitions,
    tracks,
  };
}

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
    const bgmMatches = BGM_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
    );
    const chosen = matches.length > 0 ? matches : SFX_PRESETS.slice(0, 3);
    const chosenLayered =
      layeredMatches.length > 0 ? layeredMatches : LAYERED_SFX_PRESETS.slice(0, 2);
    const chosenBgm =
      bgmMatches.length > 0 ? bgmMatches : BGM_PRESETS.slice(0, 2);
    const acousticMatches = ACOUSTIC_MUSIC_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
    );
    const chosenAcoustic =
      acousticMatches.length > 0
        ? acousticMatches
        : ACOUSTIC_MUSIC_PRESETS.slice(0, 2);
    const orchestraMatches = ORCHESTRA_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
    );
    const chosenOrchestra =
      orchestraMatches.length > 0
        ? orchestraMatches
        : ORCHESTRA_PRESETS.slice(0, 2);

    return {
      sources: [],
      result: {
        count:
          chosen.length +
          chosenLayered.length +
          chosenBgm.length +
          chosenAcoustic.length +
          chosenOrchestra.length,
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
        bgmPresets: chosenBgm.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          bpm: p.bpm,
          key: p.key,
          stepCount: p.stepCount,
          channels: p.channels,
        })),
        acousticPresets: chosenAcoustic.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          bpm: p.bpm,
          key: p.key,
          stepCount: p.stepCount,
          channels: p.channels,
        })),
        orchestraPresets: chosenOrchestra.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          bpm: p.bpm,
          key: p.key,
          totalBeats: p.totalBeats,
          tracks: p.tracks,
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

  if (name === 'compose_bgm_loop') {
    try {
      const result = composeBgmLoop({
        songName: args.songName,
        bpm: args.bpm,
        key: args.key,
        stepCount: args.stepCount,
        loops: args.loops,
        channels: args.channels,
        masterReverb: args.masterReverb,
        masterDistortion: args.masterDistortion,
        masterFilter: args.masterFilter,
      });
      return {
        sources: [],
        result,
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `BGM composition failed: ${err.message}` },
      };
    }
  }

  if (name === 'compose_real_music_score') {
    try {
      const result = buildRealMusicScore(args);
      return {
        sources: [],
        result,
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `Orchestral score composition failed: ${err.message}` },
      };
    }
  }

  if (name === 'compose_acoustic_music') {
    try {
      const result = composeAcousticMusic({
        songName: args.songName,
        bpm: args.bpm,
        key: args.key,
        stepCount: args.stepCount,
        loops: args.loops,
        channels: args.channels,
        sections: args.sections,
        hallReverb: args.hallReverb,
        warmth: args.warmth,
      });
      return {
        sources: [],
        result,
      };
    } catch (err) {
      return {
        sources: [],
        result: { error: `Acoustic composition failed: ${err.message}` },
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
  buildRealMusicScore,
};
