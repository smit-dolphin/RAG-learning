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
  const renderDuration = Math.min(120, totalDuration + 2.5);

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
