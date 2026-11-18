import {
  CacheStorage,
  DrumMachine,
  ElectricPiano,
  Reverb,
  Soundfont,
  SplendidGrandPiano,
  renderOffline,
  type Smplr,
} from 'smplr';

export interface OrchestraNoteEvent {
  beat: number;
  durationBeats: number;
  time?: number;
  duration?: number;
  note: string;
  velocity?: number;
}

export interface OrchestraTrack {
  id: string;
  name: string;
  instrument: string;
  volume: number;
  pan: number;
  muted?: boolean;
  notes: OrchestraNoteEvent[];
}

export interface OrchestraSection {
  name: string;
  startBeat: number;
  endBeat: number;
  energy?: number;
}

export type OrchestraTransitionType = 'riser' | 'reverse_cymbal' | 'sub_drop' | 'crash_impact';

export interface OrchestraTransition {
  type: OrchestraTransitionType;
  beat: number;
  durationBeats: number;
  intensity?: number;
}

export interface OrchestraScore {
  ok?: boolean;
  isRealOrchestra?: boolean;
  id?: string;
  name?: string;
  description?: string;
  songName: string;
  bpm: number;
  key: string;
  reverb: number;
  totalBeats: number;
  totalDuration: number;
  sections?: OrchestraSection[];
  transitions?: OrchestraTransition[];
  tracks: OrchestraTrack[];
}

export interface OrchestraInstrumentOption {
  value: string;
  label: string;
  category: 'Piano & Keys' | 'Strings' | 'Winds & Brass' | 'Choir & Organ' | 'Plucked & Mallets' | 'Drums';
}

export const ORCHESTRA_INSTRUMENT_OPTIONS: OrchestraInstrumentOption[] = [
  { value: 'SplendidGrandPiano', label: 'Splendid Grand Piano (Steinway)', category: 'Piano & Keys' },
  { value: 'harpsichord', label: 'Baroque Harpsichord', category: 'Piano & Keys' },
  { value: 'electric_piano_1', label: 'Electric Piano (Rhodes GM)', category: 'Piano & Keys' },
  { value: 'CP80', label: 'Electric Grand CP80', category: 'Piano & Keys' },
  { value: 'WurlitzerEP200', label: 'Wurlitzer EP200', category: 'Piano & Keys' },
  { value: 'celesta', label: 'Celesta', category: 'Piano & Keys' },

  { value: 'violin', label: 'Solo Violin', category: 'Strings' },
  { value: 'viola', label: 'Solo Viola', category: 'Strings' },
  { value: 'cello', label: 'Solo Cello', category: 'Strings' },
  { value: 'contrabass', label: 'Contrabass', category: 'Strings' },
  { value: 'string_ensemble_1', label: 'String Ensemble', category: 'Strings' },
  { value: 'tremolo_strings', label: 'Tremolo Strings', category: 'Strings' },
  { value: 'pizzicato_strings', label: 'Pizzicato Strings', category: 'Strings' },

  { value: 'flute', label: 'Concert Flute', category: 'Winds & Brass' },
  { value: 'oboe', label: 'Oboe', category: 'Winds & Brass' },
  { value: 'clarinet', label: 'Clarinet', category: 'Winds & Brass' },
  { value: 'bassoon', label: 'Bassoon', category: 'Winds & Brass' },
  { value: 'french_horn', label: 'French Horn', category: 'Winds & Brass' },
  { value: 'trumpet', label: 'Trumpet', category: 'Winds & Brass' },
  { value: 'trombone', label: 'Trombone', category: 'Winds & Brass' },
  { value: 'brass_section', label: 'Brass Section', category: 'Winds & Brass' },

  { value: 'church_organ', label: 'Pipe / Church Organ', category: 'Choir & Organ' },
  { value: 'choir_aahs', label: 'Ethereal Choir Aahs', category: 'Choir & Organ' },
  { value: 'voice_oohs', label: 'Choir Oohs', category: 'Choir & Organ' },

  { value: 'orchestral_harp', label: 'Orchestral Harp', category: 'Plucked & Mallets' },
  { value: 'acoustic_guitar_nylon', label: 'Nylon Classical Guitar', category: 'Plucked & Mallets' },
  { value: 'acoustic_guitar_steel', label: 'Steel Acoustic Guitar', category: 'Plucked & Mallets' },
  { value: 'acoustic_bass', label: 'Upright Acoustic Bass', category: 'Plucked & Mallets' },
  { value: 'marimba', label: 'Marimba', category: 'Plucked & Mallets' },
  { value: 'vibraphone', label: 'Vibraphone', category: 'Plucked & Mallets' },
  { value: 'timpani', label: 'Orchestral Timpani', category: 'Plucked & Mallets' },

  { value: 'TR-808', label: 'TR-808 Drum Machine', category: 'Drums' },
];

const ELECTRIC_PIANO_SET = new Set(['CP80', 'PianetT', 'WurlitzerEP200', 'TX81Z']);
const DRUM_MACHINE_SET = new Set(['TR-808', 'Casio-RZ1', 'LM-2', 'MFB-512', 'Roland CR-8000']);

let sharedStorage: CacheStorage | null = null;
function getSampleStorage(): CacheStorage | undefined {
  if (typeof window === 'undefined' || !('caches' in window)) return undefined;
  if (!sharedStorage) {
    sharedStorage = new CacheStorage('vectormind-smplr');
  }
  return sharedStorage;
}

function clampMidiVolume(vol: number): number {
  return Math.round(Math.min(127, Math.max(0, (Number(vol) || 0.85) * 100)));
}

function collectUniqueNotes(notes: OrchestraNoteEvent[]): string[] {
  const seen = new Set<string>();
  for (const ev of notes) {
    if (ev?.note) seen.add(String(ev.note).trim());
  }
  return Array.from(seen);
}

/**
 * Instantiate the appropriate smplr instrument class (SplendidGrandPiano,
 * ElectricPiano, DrumMachine, or GM FluidR3_GM Soundfont).
 */
function instantiateInstrument(
  context: BaseAudioContext,
  track: OrchestraTrack,
  destination?: AudioNode
): Smplr {
  const storage = getSampleStorage();
  const volume = clampMidiVolume(track.volume);
  const pan = Math.min(1, Math.max(-1, Number(track.pan) || 0));
  const instName = String(track.instrument || 'SplendidGrandPiano').trim();
  const uniqueNotes = collectUniqueNotes(track.notes || []);

  if (instName === 'SplendidGrandPiano' || instName === 'splendid_grand_piano') {
    return new SplendidGrandPiano(context, {
      storage,
      destination,
      volume,
      pan,
      notesToLoad: uniqueNotes.length > 0 ? { notes: uniqueNotes, fallback: 'nearest' } : undefined,
    });
  }

  if (ELECTRIC_PIANO_SET.has(instName)) {
    return new ElectricPiano(context, {
      instrument: instName,
      storage,
      destination,
      volume,
      pan,
    });
  }

  if (DRUM_MACHINE_SET.has(instName)) {
    return new DrumMachine(context, {
      instrument: instName,
      storage,
      destination,
      volume,
      pan,
    });
  }

  return new Soundfont(context, {
    instrument: instName,
    kit: 'FluidR3_GM',
    storage,
    destination,
    volume,
    pan,
    notesToLoad: uniqueNotes.length > 0 ? { notes: uniqueNotes, fallback: 'nearest' } : undefined,
  });
}

function createDeterministicNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, frameCount, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channelData = buffer.getChannelData(ch);
    let seed = ch === 0 ? 0x13579bdf : 0x2468ace0;
    for (let i = 0; i < frameCount; i++) {
      // Deterministic LCG white noise for identical live + offline render
      seed = (seed * 1664525 + 1013904223) >>> 0;
      channelData[i] = (seed / 0xffffffff) * 2 - 1;
    }
  }
  return buffer;
}

/**
 * Schedule hybrid Web Audio sweeps and cinematic impacts synchronized on the same
 * AudioContext / OfflineAudioContext clock as `smplr`.
 */
function scheduleHybridTransition(
  ctx: BaseAudioContext,
  destination: AudioNode,
  tr: OrchestraTransition,
  beatSec: number,
  startOffsetSec: number
): Array<() => void> {
  const stopFns: Array<() => void> = [];
  const startTime = Math.max(ctx.currentTime, startOffsetSec + (Number(tr.beat) || 0) * beatSec);
  const dur = Math.max(0.25, (Number(tr.durationBeats) || 2) * beatSec);
  const endTime = startTime + dur;
  const intensity = Math.min(1.0, Math.max(0.15, Number(tr.intensity ?? 0.75)));

  if (tr.type === 'riser') {
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(3.2, startTime);
    bp.frequency.setValueAtTime(220, startTime);
    bp.frequency.exponentialRampToValueAtTime(5200, endTime);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, startTime);
    nGain.gain.exponentialRampToValueAtTime(0.26 * intensity, Math.max(startTime + 0.05, endTime - 0.04));
    nGain.gain.linearRampToValueAtTime(0.0001, endTime);

    noiseSrc.connect(bp);
    bp.connect(nGain);
    nGain.connect(destination);
    noiseSrc.start(startTime);
    noiseSrc.stop(endTime + 0.05);
    stopFns.push(() => {
      try {
        noiseSrc.stop();
        noiseSrc.disconnect();
      } catch {
        // Ignore
      }
    });

    const synthOsc = ctx.createOscillator();
    synthOsc.type = 'sawtooth';
    synthOsc.frequency.setValueAtTime(73.42, startTime);
    synthOsc.frequency.exponentialRampToValueAtTime(293.66, endTime);
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(350, startTime);
    lpf.frequency.exponentialRampToValueAtTime(3600, endTime);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.001, startTime);
    oGain.gain.exponentialRampToValueAtTime(0.16 * intensity, Math.max(startTime + 0.05, endTime - 0.03));
    oGain.gain.linearRampToValueAtTime(0.0001, endTime);

    synthOsc.connect(lpf);
    lpf.connect(oGain);
    oGain.connect(destination);
    synthOsc.start(startTime);
    synthOsc.stop(endTime + 0.05);
    stopFns.push(() => {
      try {
        synthOsc.stop();
        synthOsc.disconnect();
      } catch {
        // Ignore
      }
    });
  } else if (tr.type === 'reverse_cymbal') {
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2400, startTime);
    hp.frequency.exponentialRampToValueAtTime(5800, endTime);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, startTime);
    nGain.gain.exponentialRampToValueAtTime(0.28 * intensity, Math.max(startTime + 0.05, endTime - 0.02));
    nGain.gain.linearRampToValueAtTime(0.0001, endTime);

    noiseSrc.connect(hp);
    hp.connect(nGain);
    nGain.connect(destination);
    noiseSrc.start(startTime);
    noiseSrc.stop(endTime + 0.05);
    stopFns.push(() => {
      try {
        noiseSrc.stop();
        noiseSrc.disconnect();
      } catch {
        // Ignore
      }
    });
  } else if (tr.type === 'sub_drop') {
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(115, startTime);
    subOsc.frequency.exponentialRampToValueAtTime(32, Math.min(endTime, startTime + Math.max(0.6, dur * 0.85)));

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, startTime);
    subGain.gain.linearRampToValueAtTime(0.45 * intensity, startTime + 0.025);
    subGain.gain.exponentialRampToValueAtTime(0.0005, endTime);

    subOsc.connect(subGain);
    subGain.connect(destination);
    subOsc.start(startTime);
    subOsc.stop(endTime + 0.05);
    stopFns.push(() => {
      try {
        subOsc.stop();
        subOsc.disconnect();
      } catch {
        // Ignore
      }
    });
  } else if (tr.type === 'crash_impact') {
    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'triangle';
    boomOsc.frequency.setValueAtTime(98, startTime);
    boomOsc.frequency.exponentialRampToValueAtTime(36, startTime + Math.min(dur, 1.4));
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.32 * intensity, startTime);
    boomGain.gain.exponentialRampToValueAtTime(0.0005, startTime + Math.min(dur, 1.8));
    boomOsc.connect(boomGain);
    boomGain.connect(destination);
    boomOsc.start(startTime);
    boomOsc.stop(startTime + Math.min(dur, 1.9));

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createDeterministicNoiseBuffer(ctx, dur + 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, startTime);
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.24 * intensity, startTime);
    cGain.gain.exponentialRampToValueAtTime(0.0004, endTime);
    noiseSrc.connect(hp);
    hp.connect(cGain);
    cGain.connect(destination);
    noiseSrc.start(startTime);
    noiseSrc.stop(endTime + 0.05);

    stopFns.push(
      () => {
        try {
          boomOsc.stop();
          boomOsc.disconnect();
        } catch {
          // Ignore
        }
      },
      () => {
        try {
          noiseSrc.stop();
          noiseSrc.disconnect();
        } catch {
          // Ignore
        }
      }
    );
  }

  return stopFns;
}

export function computeEffectiveScoreDuration(score: OrchestraScore): number {
  const bpm = Math.min(Math.max(Number(score.bpm) || 90, 40), 220);
  const beatSec = 60 / bpm;
  let maxEndBeat = Math.max(4, Number(score.totalBeats) || 16);
  for (const track of score.tracks || []) {
    for (const ev of track.notes || []) {
      const end = (Number(ev.beat) || 0) + (Number(ev.durationBeats) || 0.5);
      if (end > maxEndBeat) maxEndBeat = end;
    }
  }
  return Math.max(2, maxEndBeat * beatSec);
}

export interface OrchestraPlayCallbacks {
  onStatus?: (status: 'loading' | 'playing' | 'stopped', message?: string) => void;
  onProgress?: (currentTime: number, totalDuration: number) => void;
  onEnded?: () => void;
}

export class OrchestraPlayerController {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private instruments: Smplr[] = [];
  private stopFns: Array<() => void> = [];
  private rafId: number | null = null;
  private endTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isPlaying = false;
  private playSessionId = 0;

  getAnalyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private clearTimers(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.endTimeoutId !== null) {
      clearTimeout(this.endTimeoutId);
      this.endTimeoutId = null;
    }
  }

  stop(callbacks?: OrchestraPlayCallbacks): void {
    this.playSessionId += 1;
    this.isPlaying = false;
    this.clearTimers();

    for (const fn of this.stopFns) {
      try {
        fn();
      } catch {
        // Ignore individual note stop errors
      }
    }
    this.stopFns = [];

    for (const inst of this.instruments) {
      try {
        inst.stop();
        inst.output.disconnect();
      } catch {
        // Ignore teardown errors
      }
    }
    this.instruments = [];
    callbacks?.onProgress?.(0, 0);
    callbacks?.onStatus?.('stopped');
  }

  async loadAndPlay(
    score: OrchestraScore,
    options: { loop?: boolean } = {},
    callbacks?: OrchestraPlayCallbacks
  ): Promise<void> {
    this.stop();
    const sessionId = ++this.playSessionId;

    const activeTracks = (score.tracks || []).filter(
      (t) => !t.muted && Array.isArray(t.notes) && t.notes.length > 0
    );
    if (activeTracks.length === 0) {
      callbacks?.onStatus?.('stopped', 'No unmuted tracks with notes to play.');
      return;
    }

    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (sessionId !== this.playSessionId) return;

    if (!this.masterGain || this.masterGain.context !== this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    callbacks?.onStatus?.(
      'loading',
      `Loading ${activeTracks.length} real instrument sample bank${activeTracks.length > 1 ? 's' : ''}...`
    );

    const reverbMix = Math.min(0.75, Math.max(0, Number(score.reverb) || 0.35));
    let sharedReverb: Reverb | null = null;
    if (reverbMix > 0.02) {
      try {
        sharedReverb = new Reverb(this.ctx);
        sharedReverb.connect(this.masterGain);
      } catch {
        sharedReverb = null;
      }
    }

    const loadedTracks: Array<{ track: OrchestraTrack; instrument: Smplr }> = [];
    try {
      await Promise.all(
        activeTracks.map(async (track) => {
          if (!this.ctx) return;
          const inst = instantiateInstrument(this.ctx, track, this.masterGain ?? this.ctx.destination);
          await inst.ready;
          if (sharedReverb && reverbMix > 0.02) {
            try {
              inst.output.addEffect('reverb', sharedReverb, reverbMix);
            } catch {
              // Ignore reverb attach issues on Safari/restricted contexts
            }
          }
          loadedTracks.push({ track, instrument: inst });
          this.instruments.push(inst);
        })
      );
    } catch (err) {
      if (sessionId === this.playSessionId) {
        this.stop();
        callbacks?.onStatus?.(
          'stopped',
          `Failed to load SoundFont samples: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
      return;
    }

    if (sessionId !== this.playSessionId || !this.ctx) return;

    const bpm = Math.min(Math.max(Number(score.bpm) || 90, 40), 220);
    const beatSec = 60 / bpm;
    const totalDuration = computeEffectiveScoreDuration(score);

    const schedulePass = (passOffset: number) => {
      if (sessionId !== this.playSessionId || !this.ctx) return;

      for (const { track, instrument } of loadedTracks) {
        for (const ev of track.notes) {
          const noteTime = passOffset + (Number(ev.beat) || 0) * beatSec;
          const noteDur = Math.max(0.08, (Number(ev.durationBeats) || 0.5) * beatSec);
          const stopFn = instrument.start({
            note: ev.note,
            time: noteTime,
            duration: noteDur,
            velocity: Math.min(127, Math.max(15, Number(ev.velocity) || 84)),
          });
          this.stopFns.push(stopFn);
        }
      }

      if (Array.isArray(score.transitions) && this.ctx && this.masterGain) {
        for (const tr of score.transitions) {
          const fns = scheduleHybridTransition(this.ctx, this.masterGain, tr, beatSec, passOffset);
          this.stopFns.push(...fns);
        }
      }

      const startAudioTime = passOffset;
      const tickProgress = () => {
        if (sessionId !== this.playSessionId || !this.ctx || !this.isPlaying) return;
        const elapsed = Math.max(0, this.ctx.currentTime - startAudioTime);
        callbacks?.onProgress?.(Math.min(elapsed, totalDuration), totalDuration);
        if (elapsed < totalDuration) {
          this.rafId = requestAnimationFrame(tickProgress);
        }
      };
      this.clearTimers();
      this.rafId = requestAnimationFrame(tickProgress);

      const waitMs = Math.max(200, (totalDuration + 0.35) * 1000);
      this.endTimeoutId = setTimeout(() => {
        if (sessionId !== this.playSessionId || !this.ctx) return;
        if (options.loop) {
          this.stopFns = [];
          schedulePass(this.ctx.currentTime + 0.08);
        } else {
          this.stop();
          callbacks?.onEnded?.();
        }
      }, waitMs);
    };

    this.isPlaying = true;
    callbacks?.onStatus?.('playing');
    schedulePass(this.ctx.currentTime + 0.08);
  }
}

/**
 * Offline render a full Real Orchestra score into a 16-bit stereo WAV file using smplr.renderOffline().
 */
export async function exportOrchestraWav(score: OrchestraScore): Promise<void> {
  const activeTracks = (score.tracks || []).filter(
    (t) => !t.muted && Array.isArray(t.notes) && t.notes.length > 0
  );
  if (activeTracks.length === 0) {
    throw new Error('No unmuted instrument tracks with notes to export.');
  }

  const bpm = Math.min(Math.max(Number(score.bpm) || 90, 40), 220);
  const beatSec = 60 / bpm;
  const totalDuration = computeEffectiveScoreDuration(score);
  const renderDuration = Math.min(260, totalDuration + 2.5);

  const rendered = await renderOffline(
    async (offlineCtx) => {
      const loaded = await Promise.all(
        activeTracks.map(async (track) => {
          const inst = instantiateInstrument(offlineCtx, track);
          await inst.ready;
          return { track, inst };
        })
      );

      for (const { track, inst } of loaded) {
        for (const ev of track.notes) {
          const time = (Number(ev.beat) || 0) * beatSec;
          const duration = Math.max(0.08, (Number(ev.durationBeats) || 0.5) * beatSec);
          inst.start({
            note: ev.note,
            time,
            duration,
            velocity: Math.min(127, Math.max(15, Number(ev.velocity) || 84)),
          });
        }
      }

      if (Array.isArray(score.transitions)) {
        for (const tr of score.transitions) {
          scheduleHybridTransition(offlineCtx, offlineCtx.destination, tr, beatSec, 0);
        }
      }
    },
    {
      duration: renderDuration,
      sampleRate: 44100,
      channels: 2,
    }
  );

  const safeName = (score.songName || 'orchestra-score')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  rendered.downloadWav16(`${safeName || 'orchestra-score'}.wav`);
}
