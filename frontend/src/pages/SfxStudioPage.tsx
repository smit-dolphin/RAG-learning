import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  IconAudioWave,
  IconChevronDown,
  IconDownload,
  IconLayers,
  IconPause,
  IconPlay,
  IconPlus,
  IconSend,
  IconSliders,
  IconSpark,
  IconTrash,
  IconVolume2,
} from '../components/Icons';
import {
  OrchestraPlayerController,
  ORCHESTRA_INSTRUMENT_OPTIONS,
  computeEffectiveScoreDuration,
  exportOrchestraWav,
  type OrchestraScore,
  type OrchestraTrack,
} from '../utils/smplrOrchestra';

export interface SfxParams {
  soundName?: string;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'fm';
  frequency: number;
  freqSlide: number;
  duration: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  dutyCycle?: number;
  distortion?: number;
  filterCutoff?: number;
  bitCrush?: number;
  vibratoRate?: number;
  vibratoDepth?: number;
  modFrequency?: number;
  modDepth?: number;
  reverb?: number;
}

export interface SfxLayer {
  id: string;
  name: string;
  delay: number;
  volume: number;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'fm';
  frequency: number;
  duration: number;
  dataUri?: string;
  params: SfxParams;
}

export interface MasterEffects {
  masterReverb: number;
  masterDistortion: number;
  masterFilter: number;
}

export interface BgmChannel {
  id: string;
  name: string;
  instrument: string;
  volume: number;
  pan?: number;
  muted?: boolean;
  filterCutoff?: number;
  distortion?: number;
  steps: string[];
}

export interface BgmPreset {
  id: string;
  name: string;
  description: string;
  bpm: number;
  key: string;
  stepCount: number;
  loops: number;
  hallReverb?: number;
  warmth?: number;
  channels: BgmChannel[];
  masterEffects?: MasterEffects;
}

export interface SfxMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isThoughtOpen?: boolean;
  timestamp: string;
  dataUri?: string;
  params?: SfxParams;
  soundName?: string;
  toolStatus?: string;
  isLayered?: boolean;
  layers?: SfxLayer[];
  isBgm?: boolean;
  isAcoustic?: boolean;
  isRealOrchestra?: boolean;
  orchestraScore?: OrchestraScore;
  bpm?: number;
  musicalKey?: string;
  stepCount?: number;
  hallReverb?: number;
  warmth?: number;
  bgmChannels?: BgmChannel[];
  masterEffects?: MasterEffects;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  description: string;
  params: SfxParams;
}

export interface LayeredPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  layers: Array<{
    name: string;
    delay: number;
    volume: number;
    params: SfxParams;
  }>;
  masterEffects?: MasterEffects;
}

const INITIAL_LAYERS: SfxLayer[] = [
  {
    id: 'layer-1-zap',
    name: 'Transient Hyper-Zap',
    delay: 0.0,
    volume: 1.0,
    waveform: 'square',
    frequency: 1600,
    duration: 0.14,
    params: {
      waveform: 'square',
      frequency: 1600,
      freqSlide: -4200,
      duration: 0.14,
      attack: 0.002,
      decay: 0.06,
      sustain: 0.05,
      release: 0.06,
      distortion: 0.35,
      filterCutoff: 12000,
    },
  },
  {
    id: 'layer-2-core',
    name: 'Core Plasma Punch',
    delay: 0.03,
    volume: 0.85,
    waveform: 'sawtooth',
    frequency: 260,
    duration: 0.38,
    params: {
      waveform: 'sawtooth',
      frequency: 260,
      freqSlide: -380,
      duration: 0.38,
      attack: 0.008,
      decay: 0.15,
      sustain: 0.3,
      release: 0.18,
      distortion: 0.5,
      filterCutoff: 4500,
    },
  },
  {
    id: 'layer-3-sub',
    name: 'Sub-Bass Shockwave',
    delay: 0.06,
    volume: 1.0,
    waveform: 'noise',
    frequency: 85,
    duration: 0.75,
    params: {
      waveform: 'noise',
      frequency: 85,
      freqSlide: -70,
      duration: 0.75,
      attack: 0.015,
      decay: 0.35,
      sustain: 0.2,
      release: 0.35,
      filterCutoff: 1100,
      reverb: 0.35,
      bitCrush: 10,
    },
  },
];

const INITIAL_BGM_CHANNELS: BgmChannel[] = [
  {
    id: 'bgm-lead',
    name: 'Pulse Lead',
    instrument: 'square',
    volume: 0.85,
    filterCutoff: 9000,
    steps: [
      'E5', '-', 'G5', '-', 'A5', '~', 'G5', '-', 'E5', '-', 'C5', '-', 'D5', '~', '-', '-',
      'G5', '-', 'A5', '-', 'C6', '~', 'B5', '-', 'A5', '-', 'G5', '-', 'E5', '~', '-', '-',
    ],
  },
  {
    id: 'bgm-bass',
    name: 'Walking Bass',
    instrument: 'triangle',
    volume: 0.95,
    filterCutoff: 2400,
    steps: [
      'C3', '-', 'G2', '-', 'C3', '-', 'E3', '-', 'G2', '-', 'D3', '-', 'G2', '-', 'B2', '-',
      'F2', '-', 'C3', '-', 'F2', '-', 'A2', '-', 'G2', '-', 'D3', '-', 'G2', '-', 'B2', '-',
    ],
  },
  {
    id: 'bgm-drums',
    name: 'Chip Percussion',
    instrument: 'noise',
    volume: 0.8,
    steps: [
      'K', '-', 'H', '-', 'S', '-', 'H', '-', 'K', 'K', 'H', '-', 'S', '-', 'H', '-',
      'K', '-', 'H', '-', 'S', '-', 'H', '-', 'K', '-', 'H', 'S', 'S', '-', 'K', 'H',
    ],
  },
];

const PROMPT_CHIPS = [
  'Compose a melancholic Hollow Knight piano, solo cello & choir theme',
  'Compose a moonlit piano & bowed strings ballad in A Minor',
  'Create a dramatic church organ & string ensemble cathedral boss theme',
  'Compose a 142 BPM cyberpunk boss battle BGM loop',
  'Synthesize a 3-layer legendary treasure chest fanfare',
];

const INITIAL_ORCHESTRA_SCORE: OrchestraScore = {
  songName: 'Hollow Knight — Dirtmouth Elegy',
  bpm: 76,
  key: 'D Minor',
  reverb: 0.52,
  totalBeats: 16,
  totalDuration: 12.63,
  tracks: [
    {
      id: 'init-piano',
      name: 'Splendid Piano',
      instrument: 'SplendidGrandPiano',
      volume: 0.85,
      pan: -0.25,
      muted: false,
      notes: [
        { beat: 0, durationBeats: 2, time: 0, duration: 1.57, note: 'D4', velocity: 74 },
        { beat: 2, durationBeats: 1, time: 1.57, duration: 0.78, note: 'A4', velocity: 68 },
        { beat: 3, durationBeats: 1, time: 2.36, duration: 0.78, note: 'F5', velocity: 78 },
        { beat: 4, durationBeats: 2, time: 3.15, duration: 1.57, note: 'E5', velocity: 74 },
        { beat: 6, durationBeats: 2, time: 4.73, duration: 1.57, note: 'D5', velocity: 70 },
        { beat: 8, durationBeats: 2, time: 6.31, duration: 1.57, note: 'Bb3', velocity: 72 },
        { beat: 10, durationBeats: 1, time: 7.89, duration: 0.78, note: 'F4', velocity: 68 },
        { beat: 11, durationBeats: 1, time: 8.68, duration: 0.78, note: 'D5', velocity: 76 },
        { beat: 12, durationBeats: 2, time: 9.47, duration: 1.57, note: 'C#5', velocity: 74 },
        { beat: 14, durationBeats: 2, time: 11.05, duration: 1.57, note: 'A4', velocity: 68 },
      ],
    },
    {
      id: 'init-cello',
      name: 'Solo Cello',
      instrument: 'cello',
      volume: 0.9,
      pan: 0.25,
      muted: false,
      notes: [
        { beat: 0, durationBeats: 4, time: 0, duration: 3.15, note: 'D3', velocity: 76 },
        { beat: 4, durationBeats: 4, time: 3.15, duration: 3.15, note: 'C3', velocity: 74 },
        { beat: 8, durationBeats: 4, time: 6.31, duration: 3.15, note: 'Bb2', velocity: 78 },
        { beat: 12, durationBeats: 4, time: 9.47, duration: 3.15, note: 'A2', velocity: 80 },
      ],
    },
  ],
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SfxStudioPage() {
  // Mode: Layered SFX Stack vs Single Oscillator vs Chiptune BGM vs Acoustic Instruments vs Real Orchestra
  const [studioMode, setStudioMode] = useState<'layered' | 'single' | 'bgm' | 'acoustic' | 'orchestra'>('layered');
  const isLayeredMode = studioMode === 'layered';
  const isBgmMode = studioMode === 'bgm';
  const isAcousticMode = studioMode === 'acoustic';
  const isOrchestraMode = studioMode === 'orchestra';
  const isMusicMode = isBgmMode || isAcousticMode || isOrchestraMode;

  const [layers, setLayers] = useState<SfxLayer[]>(INITIAL_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(INITIAL_LAYERS[0].id);
  const [masterEffects, setMasterEffects] = useState<MasterEffects>({
    masterReverb: 0.25,
    masterDistortion: 0.15,
    masterFilter: 16000,
  });

  // BGM & Acoustic Sequencer State
  const [bgmBpm, setBgmBpm] = useState(132);
  const [bgmKey, setBgmKey] = useState('C Major');
  const [bgmStepCount, setBgmStepCount] = useState(32);
  const [bgmLoops, setBgmLoops] = useState(2);
  const [bgmChannels, setBgmChannels] = useState<BgmChannel[]>(INITIAL_BGM_CHANNELS);
  const [hallReverb, setHallReverb] = useState(0.4);
  const [warmth, setWarmth] = useState(0.2);
  const [loopPlayback, setLoopPlayback] = useState(true);

  const [editorParams, setEditorParams] = useState<SfxParams>(INITIAL_LAYERS[0].params);
  const [compositionTitle, setCompositionTitle] = useState('Sci-Fi Plasma Cannon');
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [layeredPresets, setLayeredPresets] = useState<LayeredPreset[]>([]);
  const [bgmPresets, setBgmPresets] = useState<BgmPreset[]>([]);
  const [acousticPresets, setAcousticPresets] = useState<BgmPreset[]>([]);
  const [orchestraPresets, setOrchestraPresets] = useState<OrchestraScore[]>([]);
  const [presetTab, setPresetTab] = useState<'layered' | 'orchestra' | 'acoustic' | 'bgm' | 'single'>('layered');

  // Real Sampled Orchestra (smplr) State
  const [orchestraScore, setOrchestraScore] = useState<OrchestraScore>(INITIAL_ORCHESTRA_SCORE);
  const [orchestraStatus, setOrchestraStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [orchestraStatusText, setOrchestraStatusText] = useState<string>('');
  const [orchestraProgress, setOrchestraProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const orchestraPlayerRef = useRef<OrchestraPlayerController | null>(null);

  // Agent Chat State
  const [chatInput, setChatInput] = useState('');
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [messages, setMessages] = useState<SfxMessage[]>([
    {
      id: 'welcome-sfx',
      role: 'assistant',
      content:
        'Welcome to **VectorMind SFX, BGM & Acoustic Studio**! I can design one-shot sounds, **combine multiple acoustic layers**, compose **chiptune BGM loops**, or synthesize **realistic physical-modeling music** (grand piano, Karplus-Strong plucked guitar, bowed strings, flute, and brass).\n\nSwitch modes on the right or ask me to compose anything!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const stopOrchestra = useCallback(() => {
    orchestraPlayerRef.current?.stop();
    setOrchestraStatus('idle');
    setOrchestraStatusText('');
    setOrchestraProgress({ current: 0, total: 0 });
  }, []);

  const playOrchestraScore = useCallback(
    async (scoreToPlay?: OrchestraScore) => {
      const target = scoreToPlay || orchestraScore;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);

      if (!orchestraPlayerRef.current) {
        orchestraPlayerRef.current = new OrchestraPlayerController();
      }

      await orchestraPlayerRef.current.loadAndPlay(
        target,
        { loop: loopPlayback },
        {
          onStatus: (status, msg) => {
            if (status === 'loading') {
              setOrchestraStatus('loading');
              setOrchestraStatusText(msg || 'Loading real SoundFont samples...');
              setIsPlaying(false);
            } else if (status === 'playing') {
              setOrchestraStatus('playing');
              setOrchestraStatusText('');
              setIsPlaying(true);
            } else {
              setOrchestraStatus('idle');
              if (msg) setOrchestraStatusText(msg);
              setIsPlaying(false);
            }
          },
          onProgress: (current, total) => {
            setOrchestraProgress({ current, total });
          },
          onEnded: () => {
            setOrchestraStatus('idle');
            setIsPlaying(false);
            setOrchestraProgress({ current: 0, total: 0 });
          },
        }
      );
    },
    [orchestraScore, loopPlayback]
  );

  const playAudio = useCallback((uri?: string) => {
    const targetUri = uri || currentAudioUri;
    if (!targetUri) return;

    stopOrchestra();
    if (audioRef.current) {
      audioRef.current.src = targetUri;
      audioRef.current.play().catch(() => { });
      setIsPlaying(true);
    }
  }, [currentAudioUri, stopOrchestra]);

  useEffect(() => {
    return () => {
      orchestraPlayerRef.current?.stop();
    };
  }, []);

  // Synthesize Single Oscillator
  const synthesizeSound = useCallback(
    async (params: SfxParams, autoplay = true) => {
      setIsSynthesizing(true);
      try {
        const res = await fetch(`${API_BASE_URL}/sfx/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (data.ok && data.dataUri) {
          setCurrentAudioUri(data.dataUri);
          if (autoplay) {
            playAudio(data.dataUri);
          }
        }
      } catch (err) {
        console.error('Synthesize sound failed:', err);
      } finally {
        setIsSynthesizing(false);
      }
    },
    [playAudio]
  );

  // Synthesize Multi-Layer Stack
  const synthesizeLayeredSound = useCallback(
    async (
      targetLayers: SfxLayer[],
      masterFx: MasterEffects,
      targetName: string,
      autoplay = true
    ) => {
      setIsSynthesizing(true);
      try {
        const payload = {
          soundName: targetName,
          layers: targetLayers.map((l) => ({
            name: l.name,
            delay: l.delay,
            volume: l.volume,
            params: l.params,
          })),
          masterReverb: masterFx.masterReverb,
          masterDistortion: masterFx.masterDistortion,
          masterFilter: masterFx.masterFilter,
        };
        const res = await fetch(`${API_BASE_URL}/sfx/layered`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok && data.dataUri) {
          setCurrentAudioUri(data.dataUri);
          if (Array.isArray(data.layers)) {
            setLayers(data.layers);
          }
          if (autoplay) {
            playAudio(data.dataUri);
          }
        }
      } catch (err) {
        console.error('Synthesize layered sound failed:', err);
      } finally {
        setIsSynthesizing(false);
      }
    },
    [playAudio]
  );

  // Compose Looping BGM Track
  const composeBgmTrack = useCallback(
    async (
      channels: BgmChannel[],
      bpm: number,
      key: string,
      stepCount: number,
      loops: number,
      masterFx: MasterEffects,
      songName: string,
      autoplay = true
    ) => {
      setIsSynthesizing(true);
      try {
        const res = await fetch(`${API_BASE_URL}/sfx/bgm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songName,
            bpm,
            key,
            stepCount,
            loops,
            channels,
            masterReverb: masterFx.masterReverb,
            masterDistortion: masterFx.masterDistortion,
            masterFilter: masterFx.masterFilter,
          }),
        });
        const data = await res.json();
        if (data.ok && data.dataUri) {
          setCurrentAudioUri(data.dataUri);
          if (Array.isArray(data.channels)) {
            setBgmChannels(data.channels);
          }
          if (autoplay) {
            playAudio(data.dataUri);
          }
        }
      } catch (err) {
        console.error('Compose BGM failed:', err);
      } finally {
        setIsSynthesizing(false);
      }
    },
    [playAudio]
  );

  // Compose Stereo Physical-Modeling Acoustic Track
  const composeAcousticTrack = useCallback(
    async (
      channels: BgmChannel[],
      bpm: number,
      key: string,
      stepCount: number,
      loops: number,
      hallRev: number,
      analogWarmth: number,
      songName: string,
      autoplay = true
    ) => {
      setIsSynthesizing(true);
      try {
        const res = await fetch(`${API_BASE_URL}/sfx/acoustic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songName,
            bpm,
            key,
            stepCount,
            loops,
            channels,
            hallReverb: hallRev,
            warmth: analogWarmth,
          }),
        });
        const data = await res.json();
        if (data.ok && data.dataUri) {
          setCurrentAudioUri(data.dataUri);
          if (Array.isArray(data.channels)) {
            setBgmChannels(data.channels);
          }
          if (autoplay) {
            playAudio(data.dataUri);
          }
        }
      } catch (err) {
        console.error('Compose Acoustic Music failed:', err);
      } finally {
        setIsSynthesizing(false);
      }
    },
    [playAudio]
  );

  // Load presets on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/sfx/presets`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          if (Array.isArray(data.presets)) setPresets(data.presets);
          if (Array.isArray(data.layeredPresets)) setLayeredPresets(data.layeredPresets);
          if (Array.isArray(data.bgmPresets)) setBgmPresets(data.bgmPresets);
          if (Array.isArray(data.acousticPresets)) setAcousticPresets(data.acousticPresets);
          if (Array.isArray(data.orchestraPresets)) {
            const normalizedPresets: OrchestraScore[] = data.orchestraPresets.map(
              (raw: Partial<OrchestraScore>, pIdx: number) => {
                const bpm = Number(raw.bpm || 84);
                const beatSec = 60 / bpm;
                const songName = String(raw.songName || raw.name || `Orchestra Preset ${pIdx + 1}`);
                const tracks: OrchestraTrack[] = (raw.tracks || []).map((tr, tIdx) => ({
                  id: tr.id || `preset-${pIdx}-tr-${tIdx}`,
                  name: tr.name || `Track ${tIdx + 1}`,
                  instrument: tr.instrument || 'SplendidGrandPiano',
                  volume: tr.volume ?? 0.85,
                  pan: tr.pan ?? 0,
                  muted: Boolean(tr.muted),
                  notes: (tr.notes || []).map((n) => ({
                    ...n,
                    time: n.time ?? (Number(n.beat) || 0) * beatSec,
                    duration: n.duration ?? (Number(n.durationBeats) || 0.5) * beatSec,
                  })),
                }));
                const totalBeats = Number(raw.totalBeats || 16);
                return {
                  ...raw,
                  id: raw.id,
                  name: raw.name,
                  description: raw.description,
                  songName,
                  bpm,
                  key: String(raw.key || 'D Minor'),
                  reverb: Number(raw.reverb ?? 0.45),
                  totalBeats,
                  totalDuration: Number(raw.totalDuration || totalBeats * beatSec),
                  tracks,
                };
              }
            );
            setOrchestraPresets(normalizedPresets);
            if (normalizedPresets[0]) {
              setOrchestraScore(normalizedPresets[0]);
            }
          }
        }
      })
      .catch((err) => console.warn('Could not load presets:', err));
  }, []);

  // Synthesize initial default sound on mount
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/sfx/layered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soundName: 'Sci-Fi Plasma Cannon',
        layers: INITIAL_LAYERS.map((l) => ({
          name: l.name,
          delay: l.delay,
          volume: l.volume,
          params: l.params,
        })),
        masterReverb: 0.25,
        masterDistortion: 0.15,
        masterFilter: 16000,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data.ok && data.dataUri) {
          setCurrentAudioUri(data.dataUri);
          if (Array.isArray(data.layers)) {
            setLayers(data.layers);
          }
        }
      })
      .catch((err) => console.warn('Init sfx error:', err));

    return () => {
      active = false;
    };
  }, []);

  // Auto-scroll chat messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isAgentThinking]);

  // Sync parameter adjustments into selected layer
  function handleParamChange(updater: (prev: SfxParams) => SfxParams) {
    setEditorParams((prev) => {
      const next = updater(prev);
      if (isLayeredMode && selectedLayerId) {
        setLayers((prevLayers) =>
          prevLayers.map((l) =>
            l.id === selectedLayerId
              ? {
                ...l,
                waveform: next.waveform,
                frequency: next.frequency,
                duration: next.duration,
                params: next,
              }
              : l
          )
        );
      }
      return next;
    });
  }

  // Multi-Layer Track Handlers
  function handleSelectLayer(layer: SfxLayer) {
    setSelectedLayerId(layer.id);
    setEditorParams({ ...layer.params, soundName: layer.name });
  }

  function handleUpdateLayerMeta(id: string, partial: Partial<SfxLayer>) {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...partial } : l))
    );
  }

  function handleAddLayer() {
    const newIdx = layers.length + 1;
    const newLayer: SfxLayer = {
      id: `layer-${newIdx}-${Date.now().toString(36)}`,
      name: `Layer ${newIdx} (Texture)`,
      delay: 0.05,
      volume: 0.8,
      waveform: 'noise',
      frequency: 600,
      duration: 0.4,
      params: {
        waveform: 'noise',
        frequency: 600,
        freqSlide: -200,
        duration: 0.4,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.1,
        release: 0.15,
        filterCutoff: 3500,
        distortion: 0.2,
      },
    };
    const nextLayers = [...layers, newLayer];
    setLayers(nextLayers);
    setSelectedLayerId(newLayer.id);
    setEditorParams(newLayer.params);
    void synthesizeLayeredSound(nextLayers, masterEffects, compositionTitle, false);
  }

  function handleRemoveLayer(id: string) {
    if (layers.length <= 1) return;
    const nextLayers = layers.filter((l) => l.id !== id);
    setLayers(nextLayers);
    if (selectedLayerId === id && nextLayers[0]) {
      setSelectedLayerId(nextLayers[0].id);
      setEditorParams(nextLayers[0].params);
    }
    void synthesizeLayeredSound(nextLayers, masterEffects, compositionTitle, true);
  }

  function loadSinglePreset(preset: Preset) {
    const next = { ...preset.params, soundName: preset.name };
    setStudioMode('single');
    setCompositionTitle(preset.name);
    setEditorParams(next);
    void synthesizeSound(next, true);
  }

  function loadLayeredPreset(preset: LayeredPreset) {
    const formattedLayers: SfxLayer[] = preset.layers.map((l, idx) => ({
      id: `layer-${idx + 1}-${Date.now().toString(36)}`,
      name: l.name,
      delay: l.delay,
      volume: l.volume,
      waveform: l.params.waveform,
      frequency: l.params.frequency,
      duration: l.params.duration,
      params: { ...l.params },
    }));

    const fx = preset.masterEffects || {
      masterReverb: 0.25,
      masterDistortion: 0.15,
      masterFilter: 16000,
    };

    setCompositionTitle(preset.name);
    setLayers(formattedLayers);
    setSelectedLayerId(formattedLayers[0]?.id || 'layer-1');
    if (formattedLayers[0]) {
      setEditorParams(formattedLayers[0].params);
    }
    setMasterEffects(fx);
    setStudioMode('layered');
    void synthesizeLayeredSound(formattedLayers, fx, preset.name, true);
  }

  function loadBgmPreset(preset: BgmPreset) {
    const formattedChannels: BgmChannel[] = preset.channels.map((ch, idx) => ({
      id: ch.id || `ch-${idx + 1}-${Date.now().toString(36)}`,
      name: ch.name,
      instrument: ch.instrument,
      volume: ch.volume ?? 0.85,
      muted: Boolean(ch.muted),
      filterCutoff: ch.filterCutoff ?? 12000,
      distortion: ch.distortion ?? 0,
      steps: [...ch.steps],
    }));

    const fx = preset.masterEffects || {
      masterReverb: 0.2,
      masterDistortion: 0.05,
      masterFilter: 14000,
    };

    setCompositionTitle(preset.name);
    setBgmBpm(preset.bpm);
    setBgmKey(preset.key);
    setBgmStepCount(preset.stepCount);
    setBgmLoops(preset.loops || 2);
    setBgmChannels(formattedChannels);
    setMasterEffects(fx);
    setStudioMode('bgm');
    void composeBgmTrack(
      formattedChannels,
      preset.bpm,
      preset.key,
      preset.stepCount,
      preset.loops || 2,
      fx,
      preset.name,
      true
    );
  }

  function loadAcousticPreset(preset: BgmPreset) {
    const formattedChannels: BgmChannel[] = preset.channels.map((ch, idx) => ({
      id: ch.id || `ac-${idx + 1}-${Date.now().toString(36)}`,
      name: ch.name,
      instrument: ch.instrument,
      volume: ch.volume ?? 0.85,
      pan: ch.pan ?? 0,
      muted: Boolean(ch.muted),
      steps: [...ch.steps],
    }));

    const rev = preset.hallReverb ?? 0.4;
    const warm = preset.warmth ?? 0.2;

    setCompositionTitle(preset.name);
    setBgmBpm(preset.bpm);
    setBgmKey(preset.key);
    setBgmStepCount(preset.stepCount);
    setBgmLoops(preset.loops || 2);
    setHallReverb(rev);
    setWarmth(warm);
    setBgmChannels(formattedChannels);
    setStudioMode('acoustic');
    void composeAcousticTrack(
      formattedChannels,
      preset.bpm,
      preset.key,
      preset.stepCount,
      preset.loops || 2,
      rev,
      warm,
      preset.name,
      true
    );
  }

  function loadOrchestraPreset(preset: OrchestraScore, autoplay = true) {
    const bpm = Number(preset.bpm || 84);
    const beatSec = 60 / bpm;
    const resolvedTitle = preset.songName || preset.name || 'Orchestral Score';
    const cloned: OrchestraScore = {
      ...preset,
      songName: resolvedTitle,
      bpm,
      totalDuration: preset.totalDuration || (preset.totalBeats || 16) * beatSec,
      tracks: preset.tracks.map((tr, idx) => ({
        ...tr,
        id: tr.id || `orch-tr-${idx + 1}-${Date.now().toString(36)}`,
        muted: Boolean(tr.muted),
        notes: tr.notes.map((n) => ({
          ...n,
          time: n.time ?? (Number(n.beat) || 0) * beatSec,
          duration: n.duration ?? (Number(n.durationBeats) || 0.5) * beatSec,
        })),
      })),
    };
    setOrchestraScore(cloned);
    setCompositionTitle(resolvedTitle);
    setStudioMode('orchestra');
    setPresetTab('orchestra');
    if (autoplay) {
      void playOrchestraScore(cloned);
    }
  }

  async function handleExportOrchestraWav(scoreToExport?: OrchestraScore) {
    const target = scoreToExport || orchestraScore;
    setIsSynthesizing(true);
    setOrchestraStatusText('Rendering stereo 44.1kHz WAV offline...');
    try {
      await exportOrchestraWav(target);
      setOrchestraStatusText('');
    } catch (err) {
      setOrchestraStatusText(
        err instanceof Error ? err.message : 'Offline WAV export failed'
      );
    } finally {
      setIsSynthesizing(false);
    }
  }

  function handleUpdateOrchestraTrack(trackId: string, partial: Partial<OrchestraTrack>) {
    setOrchestraScore((prev) => ({
      ...prev,
      tracks: prev.tracks.map((tr) => (tr.id === trackId ? { ...tr, ...partial } : tr)),
    }));
  }

  function handleAddOrchestraTrack() {
    setOrchestraScore((prev) => {
      const idx = prev.tracks.length + 1;
      const newTrack: OrchestraTrack = {
        id: `orch-tr-${idx}-${Date.now().toString(36)}`,
        name: `Track ${idx} (Harp)`,
        instrument: 'orchestral_harp',
        volume: 0.75,
        pan: idx % 2 === 0 ? 0.3 : -0.3,
        muted: false,
        notes: [
          { beat: 0, durationBeats: 2, time: 0, duration: 1.5, note: 'D4', velocity: 72 },
          { beat: 2, durationBeats: 2, time: 1.5, duration: 1.5, note: 'A4', velocity: 72 },
          { beat: 4, durationBeats: 2, time: 3.0, duration: 1.5, note: 'F4', velocity: 72 },
          { beat: 6, durationBeats: 2, time: 4.5, duration: 1.5, note: 'A4', velocity: 72 },
        ],
      };
      return {
        ...prev,
        tracks: [...prev.tracks, newTrack],
      };
    });
  }

  function handleRemoveOrchestraTrack(trackId: string) {
    setOrchestraScore((prev) => {
      if (prev.tracks.length <= 1) return prev;
      return {
        ...prev,
        tracks: prev.tracks.filter((tr) => tr.id !== trackId),
      };
    });
  }

  function getDefaultStepToken(ch: BgmChannel): string {
    const inst = ch.instrument.toLowerCase();
    const label = ch.name.toLowerCase();
    if (inst.includes('kick') || label.includes('kick')) return 'K';
    if (inst.includes('snare') || label.includes('snare')) return 'S';
    if (inst.includes('hihat') || label.includes('hat')) return 'H';
    if (inst === 'noise' || label.includes('drum') || label.includes('perc')) return 'K';
    if (inst === 'piano' || inst === 'strings') return 'Am';
    if (inst === 'guitar' || inst === 'harp') return 'A3';
    if (inst === 'triangle' || inst === 'sawtooth' || label.includes('bass')) return 'C3';
    return 'C5';
  }

  function handleToggleBgmStep(channelId: string, stepIndex: number) {
    setBgmChannels((prev) =>
      prev.map((ch) => {
        if (ch.id !== channelId) return ch;
        const nextSteps = [...ch.steps];
        const curr = nextSteps[stepIndex] || '-';
        nextSteps[stepIndex] = curr === '-' ? getDefaultStepToken(ch) : '-';
        return { ...ch, steps: nextSteps };
      })
    );
  }

  function handleUpdateBgmChannel(channelId: string, partial: Partial<BgmChannel>) {
    setBgmChannels((prev) =>
      prev.map((ch) => (ch.id === channelId ? { ...ch, ...partial } : ch))
    );
  }

  function handleAddBgmChannel() {
    const idx = bgmChannels.length + 1;
    const newCh: BgmChannel = {
      id: `ch-${idx}-${Date.now().toString(36)}`,
      name: isAcousticMode ? `Acoustic Track ${idx}` : `Track ${idx} (Arp)`,
      instrument: isAcousticMode ? 'guitar' : 'triangle',
      volume: 0.75,
      pan: isAcousticMode ? (idx % 2 === 0 ? 0.3 : -0.3) : 0,
      filterCutoff: 8000,
      steps: Array.from({ length: bgmStepCount }, (_, i) =>
        i % 4 === 0 ? 'C4' : i % 4 === 2 ? 'G4' : '-'
      ),
    };
    setBgmChannels((prev) => [...prev, newCh]);
  }

  function handleRemoveBgmChannel(channelId: string) {
    if (bgmChannels.length <= 1) return;
    setBgmChannels((prev) => prev.filter((c) => c.id !== channelId));
  }

  // Draw Audio Waveform Visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    for (let x = 0; x < width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    if (isOrchestraMode) {
      const totalBeats = Math.max(orchestraScore.totalBeats || 16, 8);
      const colors = ['#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ec4899'];
      const trackCount = Math.max(orchestraScore.tracks.length, 1);
      const rowH = (height - 16) / trackCount;

      orchestraScore.tracks.forEach((tr, rIdx) => {
        if (tr.muted) return;
        ctx.fillStyle = colors[rIdx % colors.length];
        tr.notes.forEach((ev) => {
          const x = (ev.beat / totalBeats) * width;
          const w = Math.max((ev.durationBeats / totalBeats) * width - 2, 4);
          ctx.globalAlpha = Math.max(0.35, Math.min(0.95, (ev.velocity || 85) / 115));
          ctx.fillRect(x + 1, 8 + rIdx * rowH + 3, w, Math.max(rowH - 6, 5));
        });
      });

      const totalDur = computeEffectiveScoreDuration(orchestraScore);
      if (orchestraStatus === 'playing' && totalDur > 0) {
        const playheadX = Math.min(width - 2, Math.max(0, (orchestraProgress.current / totalDur) * width));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (isMusicMode) {
      // Draw mini piano-roll / rhythmic energy bars for active BGM channels
      const totalCols = Math.max(bgmStepCount, 16);
      const colW = width / totalCols;
      const rowH = (height - 16) / Math.max(bgmChannels.length, 1);
      const colors = ['#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ef4444'];

      bgmChannels.forEach((ch, rIdx) => {
        if (ch.muted) return;
        ctx.fillStyle = colors[rIdx % colors.length];
        ch.steps.slice(0, totalCols).forEach((step, cIdx) => {
          if (step && step !== '-') {
            ctx.globalAlpha = step === '~' ? 0.45 : 0.85;
            ctx.fillRect(cIdx * colW + 2, 8 + rIdx * rowH + 3, Math.max(colW - 4, 4), Math.max(rowH - 6, 6));
          }
        });
      });
      ctx.globalAlpha = 1;
      return;
    }

    // Waveform line
    ctx.strokeStyle = isPlaying ? '#06b6d4' : '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const points = width;
    const duration = isLayeredMode
      ? Math.max(...layers.map((l) => l.delay + l.params.duration), 0.2)
      : editorParams.duration || 0.25;

    for (let i = 0; i < points; i++) {
      const progress = i / points;
      const t = progress * duration;
      const x = i;

      let val = 0;
      if (isLayeredMode) {
        // Multi-layer sample superposition
        for (const layer of layers) {
          if (t >= layer.delay && t <= layer.delay + layer.params.duration) {
            const relT = (t - layer.delay) / layer.params.duration;
            const freq = Math.max(
              20,
              layer.params.frequency + (layer.params.freqSlide || 0) * (t - layer.delay)
            );
            let layerVal = 0;
            switch (layer.waveform) {
              case 'sine':
                layerVal = Math.sin(relT * freq * Math.PI * 0.1);
                break;
              case 'square':
                layerVal = Math.sin(relT * freq * Math.PI * 0.1) >= 0 ? 0.8 : -0.8;
                break;
              case 'sawtooth':
                layerVal = 2 * ((relT * freq * 0.05) % 1) - 1;
                break;
              case 'triangle':
                layerVal = Math.abs(4 * ((relT * freq * 0.05) % 1 - 0.5)) - 1;
                break;
              case 'noise':
                layerVal = (Math.random() * 2 - 1) * 0.7;
                break;
              case 'fm':
                layerVal = Math.sin(relT * freq * Math.PI * 0.1 + Math.sin(relT * 30) * 1.5);
                break;
            }
            val += layerVal * (layer.volume || 1.0) * 0.45;
          }
        }
      } else {
        // Single oscillator calculation
        const freq = Math.max(
          20,
          editorParams.frequency + (editorParams.freqSlide || 0) * (progress * editorParams.duration)
        );
        switch (editorParams.waveform) {
          case 'sine':
            val = Math.sin(progress * freq * Math.PI * 0.15);
            break;
          case 'square':
            val = Math.sin(progress * freq * Math.PI * 0.15) >= 0 ? 0.85 : -0.85;
            break;
          case 'sawtooth':
            val = 2 * ((progress * freq * 0.08) % 1) - 1;
            break;
          case 'triangle':
            val = Math.abs(4 * ((progress * freq * 0.08) % 1 - 0.5)) - 1;
            break;
          case 'noise':
            val = (Math.random() * 2 - 1) * 0.8;
            break;
          case 'fm':
            val = Math.sin(progress * freq * Math.PI * 0.15 + Math.sin(progress * 25) * 2.0);
            break;
        }
      }

      if (editorParams.distortion && editorParams.distortion > 0) {
        val = Math.tanh(val * (1 + editorParams.distortion * 3));
      }

      const y = height / 2 - val * (height * 0.38);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [
    editorParams,
    layers,
    isLayeredMode,
    isMusicMode,
    isOrchestraMode,
    bgmChannels,
    bgmStepCount,
    orchestraScore,
    orchestraStatus,
    orchestraProgress,
    isPlaying,
  ]);

  // Handle Chat Submit to Agent
  async function handleSendPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isAgentThinking) return;

    const userMsg: SfxMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const aiMsgId = crypto.randomUUID();
    const aiMsg: SfxMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      thought: '',
      isThoughtOpen: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setChatInput('');
    setIsAgentThinking(true);
    setActiveTool('Planning acoustic blueprint & DSP architecture...');

    try {
      const historyPayload = messages
        .filter((m) => m.content.trim())
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          agentic: true,
          mode: 'sfx',
          subMode: studioMode,
        }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processFrame = (frame: string) => {
        const lines = frame.split(/\r?\n/);
        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) return;
        const rawJson = dataLines.join('\n');

        try {
          const data = JSON.parse(rawJson);
          if (eventName === 'thought') {
            setActiveTool('Reasoning acoustic design & DSP plan...');
            if (data.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, thought: (m.thought || '') + data.text }
                    : m
                )
              );
            }
          } else if (eventName === 'tool') {
            setActiveTool(
              data.name === 'compose_real_music_score'
                ? 'Arranging real sampled orchestral score (smplr SoundFonts)...'
                : data.name === 'compose_acoustic_music'
                  ? 'Rendering physical-modeling acoustic instruments...'
                  : data.name === 'compose_bgm_loop'
                    ? 'Composing multi-channel BGM loop...'
                    : `Synthesizing sound: ${data.name}...`
            );
          } else if (eventName === 'tool_result') {
            if (data.name === 'compose_real_music_score' && data.result?.isRealOrchestra) {
              const resScore: OrchestraScore = {
                ok: true,
                isRealOrchestra: true,
                songName: String(data.result.songName || 'Orchestral Score'),
                bpm: Number(data.result.bpm || 84),
                key: String(data.result.key || 'D Minor'),
                reverb: Number(data.result.reverb ?? 0.45),
                totalBeats: Number(data.result.totalBeats || 16),
                totalDuration: Number(data.result.totalDuration || 12),
                tracks: Array.isArray(data.result.tracks) ? data.result.tracks : [],
              };

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                      ...m,
                      soundName: resScore.songName,
                      isRealOrchestra: true,
                      orchestraScore: resScore,
                      isAcoustic: false,
                      isBgm: false,
                      isLayered: false,
                      bpm: resScore.bpm,
                      musicalKey: resScore.key,
                    }
                    : m
                )
              );

              setStudioMode('orchestra');
              setPresetTab('orchestra');
              setOrchestraScore(resScore);
              setCompositionTitle(resScore.songName);
              void playOrchestraScore(resScore);
            } else if (data.name === 'compose_acoustic_music' && data.result?.dataUri) {
              const acUri = data.result.dataUri as string;
              const songTitle = data.result.soundName || 'Acoustic Ensemble';
              const resChannels = (data.result.channels as BgmChannel[]) || [];
              const resBpm = Number(data.result.bpm || 96);
              const resKey = String(data.result.key || 'A Minor');
              const resStepCount = Number(data.result.stepCount || 32);
              const resLoops = Number(data.result.loops || 2);
              const rev = Number(data.result.acousticEffects?.hallReverb ?? 0.38);
              const warm = Number(data.result.acousticEffects?.warmth ?? 0.2);

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                      ...m,
                      dataUri: acUri,
                      soundName: songTitle,
                      isAcoustic: true,
                      isBgm: false,
                      isLayered: false,
                      bpm: resBpm,
                      musicalKey: resKey,
                      stepCount: resStepCount,
                      hallReverb: rev,
                      warmth: warm,
                      bgmChannels: resChannels,
                    }
                    : m
                )
              );

              setStudioMode('acoustic');
              setCompositionTitle(songTitle);
              setBgmBpm(resBpm);
              setBgmKey(resKey);
              setBgmStepCount(resStepCount);
              setBgmLoops(resLoops);
              setHallReverb(rev);
              setWarmth(warm);
              setBgmChannels(resChannels);
              setLoopPlayback(true);
              setCurrentAudioUri(acUri);
              playAudio(acUri);
            } else if (data.name === 'compose_bgm_loop' && data.result?.dataUri) {
              const bgmUri = data.result.dataUri as string;
              const songTitle = data.result.soundName || 'Game BGM Loop';
              const resChannels = (data.result.channels as BgmChannel[]) || [];
              const resBpm = Number(data.result.bpm || 128);
              const resKey = String(data.result.key || 'C Major');
              const resStepCount = Number(data.result.stepCount || 32);
              const resLoops = Number(data.result.loops || 2);
              const masterFx = data.result.masterEffects || {
                masterReverb: 0.2,
                masterDistortion: 0.05,
                masterFilter: 16000,
              };

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                      ...m,
                      dataUri: bgmUri,
                      soundName: songTitle,
                      isBgm: true,
                      isLayered: false,
                      bpm: resBpm,
                      musicalKey: resKey,
                      stepCount: resStepCount,
                      bgmChannels: resChannels,
                      masterEffects: masterFx,
                    }
                    : m
                )
              );

              setStudioMode('bgm');
              setCompositionTitle(songTitle);
              setBgmBpm(resBpm);
              setBgmKey(resKey);
              setBgmStepCount(resStepCount);
              setBgmLoops(resLoops);
              setBgmChannels(resChannels);
              setMasterEffects(masterFx);
              setLoopPlayback(true);
              setCurrentAudioUri(bgmUri);
              playAudio(bgmUri);
            } else if (
              (data.name === 'synthesize_layered_sfx' ||
                data.name === 'blend_sfx_presets') &&
              data.result?.dataUri
            ) {
              // Multi-Layer Result
              const compositeUri = data.result.dataUri as string;
              const newName = data.result.soundName || 'Layered Composition';
              const resLayers = (data.result.layers as SfxLayer[]) || [];
              const masterFx = data.result.masterEffects || {
                masterReverb: 0.25,
                masterDistortion: 0.15,
                masterFilter: 16000,
              };

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                      ...m,
                      dataUri: compositeUri,
                      soundName: newName,
                      isLayered: true,
                      isBgm: false,
                      layers: resLayers,
                      masterEffects: masterFx,
                    }
                    : m
                )
              );

              // Update Center Editor to Layered Mode
              setStudioMode('layered');
              setCompositionTitle(newName);
              setLayers(resLayers);
              if (resLayers[0]) {
                setSelectedLayerId(resLayers[0].id);
                setEditorParams(resLayers[0].params);
              }
              setMasterEffects(masterFx);
              setCurrentAudioUri(compositeUri);
              playAudio(compositeUri);
            } else if (data.name === 'synthesize_math_sfx' && data.result?.dataUri) {
              // Single Oscillator Result
              const newParams = data.result.params as SfxParams;
              const newUri = data.result.dataUri as string;
              const newName = data.result.soundName || 'Synthesized Sound';

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? {
                      ...m,
                      dataUri: newUri,
                      params: newParams,
                      soundName: newName,
                      isLayered: false,
                      isBgm: false,
                    }
                    : m
                )
              );

              setStudioMode('single');
              setCompositionTitle(newName);
              setEditorParams({ ...newParams, soundName: newName });
              setCurrentAudioUri(newUri);
              playAudio(newUri);
            }
          } else if (eventName === 'delta') {
            setActiveTool(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                    ...m,
                    content: m.content + (data.text || ''),
                    isThoughtOpen: false,
                  }
                  : m
              )
            );
          }
        } catch {
          // Ignore partial or unparseable frame
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          if (frame.trim()) {
            processFrame(frame);
          }
        }
      }

      if (buffer.trim()) {
        processFrame(buffer);
      }
    } catch (err) {
      console.error('SFX Agent chat error:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
              ...m,
              content:
                'Sorry, I encountered an issue while generating the sound effect.',
            }
            : m
        )
      );
    } finally {
      setIsAgentThinking(false);
      setActiveTool(null);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSendPrompt(chatInput);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendPrompt(chatInput);
    }
  }

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || layers[0];

  return (
    <div className="sfx-studio-layout">
      {/* Hidden audio element for browser playback */}
      <audio
        ref={audioRef}
        loop={isMusicMode && loopPlayback}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
      />

      {/* LEFT COLUMN: Agentic Sound Generator Chat */}
      <div className="sfx-chat-column">
        <div className="sfx-chat-header">
          <div className="sfx-chat-title-group">
            <span className="sfx-agent-badge">
              <IconAudioWave />
              <span>SFX Audio Architect</span>
            </span>
            <span className="sfx-agent-sub">
              Multi-Layer Math DSP • Combinatorial Audio Synthesis
            </span>
          </div>
        </div>

        {/* Chat Stream with Composite and Single Sound Cards */}
        <div className="sfx-messages-scroll">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`sfx-message ${msg.role === 'user' ? 'user-bubble' : 'assistant-card'}`}
            >
              {msg.role === 'user' ? (
                <div className="user-prompt-tab-row">
                  <div className="user-prompt-tab">
                    <div className="user-prompt-tab-header">
                      <span className="user-prompt-tab-label">Sound Request</span>
                      <span className="message-timestamp">{msg.timestamp}</span>
                    </div>
                    <div className="user-prompt-tab-content">{msg.content}</div>
                  </div>
                </div>
              ) : (
                <div className="sfx-assistant-content">
                  <div className="message-meta-bar">
                    <span className="author-name">VectorMind SFX Agent</span>
                    <span className="message-timestamp">{msg.timestamp}</span>
                  </div>

                  {/* Pre-Generation Acoustic Planning & Reasoning Drawer */}
                  {msg.thought && (
                    <div className="sfx-thought-box">
                      <button
                        type="button"
                        className="sfx-thought-toggle"
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id
                                ? { ...m, isThoughtOpen: !m.isThoughtOpen }
                                : m
                            )
                          )
                        }
                        aria-expanded={Boolean(msg.isThoughtOpen)}
                      >
                        <span className="sfx-thought-title">
                          <IconSpark />
                          <span>
                            {msg.dataUri || msg.orchestraScore || msg.content
                              ? 'Acoustic Planning & DSP Reasoning'
                              : 'Planning acoustic architecture...'}
                          </span>
                        </span>
                        <IconChevronDown
                          className={`sfx-thought-chevron ${msg.isThoughtOpen ? 'open' : ''}`}
                        />
                      </button>
                      {msg.isThoughtOpen && (
                        <div className="sfx-thought-content">{msg.thought}</div>
                      )}
                    </div>
                  )}

                  {msg.content && <div className="sfx-text-body">{msg.content}</div>}

                  {/* Playable Inline Sound / BGM / Acoustic / Orchestra Card generated by Agent */}
                  {(msg.dataUri || (msg.isRealOrchestra && msg.orchestraScore)) && (
                    <div className="sfx-inline-player-card">
                      <div className="sfx-inline-player-header">
                        <span className="sfx-sound-name">
                          {msg.isRealOrchestra || msg.isLayered || msg.isBgm || msg.isAcoustic ? <IconLayers /> : <IconAudioWave />}
                          <span>{msg.soundName || msg.orchestraScore?.songName || 'Composite Audio'}</span>
                        </span>
                        <span className="sfx-sound-waveform">
                          {msg.isRealOrchestra && msg.orchestraScore
                            ? `${msg.orchestraScore.bpm} BPM • ${msg.orchestraScore.key} • REAL SAMPLES`
                            : msg.isAcoustic
                              ? `${msg.bpm || 96} BPM • STEREO ACOUSTIC`
                              : msg.isBgm
                                ? `${msg.bpm || 128} BPM • ${msg.musicalKey || 'BGM'}`
                                : msg.isLayered
                                  ? `${msg.layers?.length || 3} LAYERS`
                                  : msg.params?.waveform?.toUpperCase() || 'DSP'}
                        </span>
                      </div>

                      {/* Real Orchestra Sampled Tracks Breakdown */}
                      {msg.isRealOrchestra && msg.orchestraScore && msg.orchestraScore.tracks.length > 0 && (
                        <div className="sfx-inline-layers-breakdown">
                          <span className="sfx-breakdown-title">
                            Real SoundFont Orchestra ({msg.orchestraScore.totalBeats} Beats):
                          </span>
                          {msg.orchestraScore.tracks.map((tr, tIdx) => (
                            <div key={tr.id || tIdx} className="sfx-inline-layer-row">
                              <div className="sfx-inline-layer-info">
                                <span className="sfx-waveform-badge orchestra">
                                  {tr.instrument}
                                </span>
                                <span>{tr.name}</span>
                              </div>
                              <span className="sfx-layer-delay-badge">
                                {tr.notes.length} notes
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Multi-Channel BGM / Acoustic Breakdown */}
                      {(msg.isBgm || msg.isAcoustic) && msg.bgmChannels && msg.bgmChannels.length > 0 && (
                        <div className="sfx-inline-layers-breakdown">
                          <span className="sfx-breakdown-title">
                            {msg.isAcoustic ? 'Acoustic Ensemble' : 'Music Channels'} ({msg.stepCount || 32} Steps):
                          </span>
                          {msg.bgmChannels.map((ch, cIdx) => (
                            <div key={ch.id || cIdx} className="sfx-inline-layer-row">
                              <div className="sfx-inline-layer-info">
                                <span className={`sfx-waveform-badge ${ch.instrument}`}>
                                  {ch.instrument}
                                </span>
                                <span>{ch.name}</span>
                              </div>
                              <span className="sfx-layer-delay-badge">
                                {ch.steps.filter((s) => s && s !== '-' && s !== '~').length} events
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Multi-Layer Breakdown with Solo Audition */}
                      {msg.isLayered && msg.layers && msg.layers.length > 0 && (
                        <div className="sfx-inline-layers-breakdown">
                          <span className="sfx-breakdown-title">Acoustic Layers:</span>
                          {msg.layers.map((l, lIdx) => (
                            <div key={l.id || lIdx} className="sfx-inline-layer-row">
                              <div className="sfx-inline-layer-info">
                                <span className={`sfx-waveform-badge ${l.waveform}`}>
                                  {l.waveform}
                                </span>
                                <span>{l.name}</span>
                                {l.delay > 0 && (
                                  <span className="sfx-layer-delay-badge">
                                    +{l.delay.toFixed(2)}s
                                  </span>
                                )}
                              </div>
                              {l.dataUri && (
                                <button
                                  type="button"
                                  className="sfx-solo-btn"
                                  onClick={() => playAudio(l.dataUri)}
                                  title={`Solo preview ${l.name}`}
                                >
                                  <IconVolume2 />
                                  <span>Solo</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="sfx-inline-actions">
                        <button
                          type="button"
                          className="btn-primary sfx-play-btn"
                          onClick={() => {
                            if (msg.isRealOrchestra && msg.orchestraScore) {
                              void playOrchestraScore(msg.orchestraScore);
                            } else {
                              playAudio(msg.dataUri);
                            }
                          }}
                        >
                          <IconPlay />
                          <span>
                            {msg.isRealOrchestra
                              ? 'Play Real Audio'
                              : msg.isBgm || msg.isAcoustic
                                ? 'Play Track'
                                : 'Play Mix'}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="btn-ghost sfx-load-editor-btn"
                          onClick={() => {
                            if (msg.isRealOrchestra && msg.orchestraScore) {
                              loadOrchestraPreset(msg.orchestraScore, false);
                            } else if (msg.isAcoustic && msg.bgmChannels) {
                              setStudioMode('acoustic');
                              setCompositionTitle(msg.soundName || 'Acoustic Ensemble');
                              setBgmBpm(msg.bpm || 96);
                              setBgmKey(msg.musicalKey || 'A Minor');
                              setBgmStepCount(msg.stepCount || 32);
                              setHallReverb(msg.hallReverb ?? 0.38);
                              setWarmth(msg.warmth ?? 0.2);
                              setBgmChannels(msg.bgmChannels);
                            } else if (msg.isBgm && msg.bgmChannels) {
                              setStudioMode('bgm');
                              setCompositionTitle(msg.soundName || 'Game BGM Loop');
                              setBgmBpm(msg.bpm || 128);
                              setBgmKey(msg.musicalKey || 'C Major');
                              setBgmStepCount(msg.stepCount || 32);
                              setBgmChannels(msg.bgmChannels);
                              if (msg.masterEffects) setMasterEffects(msg.masterEffects);
                            } else if (msg.isLayered && msg.layers) {
                              setStudioMode('layered');
                              setCompositionTitle(msg.soundName || 'Layered Composition');
                              setLayers(msg.layers);
                              if (msg.layers[0]) {
                                setSelectedLayerId(msg.layers[0].id);
                                setEditorParams(msg.layers[0].params);
                              }
                              if (msg.masterEffects) setMasterEffects(msg.masterEffects);
                            } else if (msg.params) {
                              setStudioMode('single');
                              setCompositionTitle(msg.soundName || 'Custom SFX');
                              setEditorParams({ ...msg.params, soundName: msg.soundName });
                            }
                            if (msg.dataUri) {
                              setCurrentAudioUri(msg.dataUri);
                            }
                          }}
                          title="Load this audio into the center editor"
                        >
                          <IconSliders />
                          <span>
                            {msg.isRealOrchestra
                              ? 'Load in Orchestra Studio'
                              : msg.isAcoustic
                                ? 'Load in Acoustic Studio'
                                : msg.isBgm
                                  ? 'Load in Sequencer'
                                  : 'Load in Editor'}
                          </span>
                        </button>

                        {msg.isRealOrchestra && msg.orchestraScore ? (
                          <button
                            type="button"
                            className="btn-ghost sfx-download-link"
                            onClick={() => void handleExportOrchestraWav(msg.orchestraScore)}
                            disabled={isSynthesizing}
                            title="Render offline 16-bit WAV via smplr"
                          >
                            <IconDownload />
                            <span>{isSynthesizing ? 'Exporting...' : 'WAV'}</span>
                          </button>
                        ) : (
                          <a
                            href={msg.dataUri}
                            download={`${(msg.soundName || 'game-sfx').toLowerCase().replace(/\s+/g, '-')}.wav`}
                            className="btn-ghost sfx-download-link"
                            title="Download 16-bit WAV"
                          >
                            <IconDownload />
                            <span>WAV</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isAgentThinking && (
            <div className="thinking-status" style={{ padding: '8px 12px' }}>
              <span className="pulse-indicator" />
              <span>{activeTool || 'Synthesizing mathematical audio layers...'}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompt Chips */}
        <div className="sfx-quick-chips">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="sfx-chip-btn"
              onClick={() => void handleSendPrompt(chip)}
              disabled={isAgentThinking}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Composer Form */}
        <form className="sfx-chat-composer" onSubmit={handleFormSubmit}>
          <textarea
            rows={2}
            className="composer-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask agent: 'Combine a laser zap attack with a deep sub-bass explosion' or 'create a 3-layer fanfare'..."
            disabled={isAgentThinking}
          />
          <button
            type="submit"
            className="btn-primary composer-submit-btn"
            disabled={!chatInput.trim() || isAgentThinking}
            aria-label="Send audio request"
          >
            <IconSend />
          </button>
        </form>
      </div>

      {/* CENTER & RIGHT COLUMN: Multi-Track DSP Workstation */}
      <div className="sfx-editor-column">
        {/* Top Header Bar */}
        <div className="sfx-editor-header">
          <div className="sfx-header-left">
            <input
              type="text"
              className="sfx-title-input"
              value={compositionTitle}
              onChange={(e) => setCompositionTitle(e.target.value)}
              title="Click to rename composition"
            />
            <span className="sfx-duration-pill">
              {isOrchestraMode
                ? `${orchestraScore.bpm} BPM • ${orchestraScore.key} • smplr SoundFonts`
                : isAcousticMode
                  ? `${bgmBpm} BPM • ${bgmKey} • Stereo Acoustic`
                  : isBgmMode
                    ? `${bgmBpm} BPM • ${bgmKey} • ${bgmChannels.length} Tracks`
                    : isLayeredMode
                      ? `${layers.length} Layers • 44.1kHz 16-bit PCM`
                      : `${(editorParams.duration || 0.25).toFixed(2)}s • 44.1kHz`}
            </span>
          </div>

          <div className="sfx-header-actions">
            {isMusicMode && (
              <button
                type="button"
                className={`btn-ghost sfx-loop-btn ${loopPlayback ? 'active' : ''}`}
                onClick={() => setLoopPlayback((prev) => !prev)}
                title="Toggle seamless loop playback"
              >
                <span>{loopPlayback ? '🔁 Loop On' : 'Loop Off'}</span>
              </button>
            )}

            <button
              type="button"
              className={`btn-primary sfx-main-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => {
                if (isOrchestraMode) {
                  if (orchestraStatus === 'playing' || orchestraStatus === 'loading') {
                    stopOrchestra();
                  } else {
                    void playOrchestraScore();
                  }
                  return;
                }
                if (isPlaying) {
                  audioRef.current?.pause();
                  setIsPlaying(false);
                } else {
                  playAudio();
                }
              }}
              title="Play master audio composition"
            >
              {isPlaying || orchestraStatus === 'playing' ? <IconPause /> : <IconPlay />}
              <span>
                {isOrchestraMode
                  ? orchestraStatus === 'loading'
                    ? 'Loading Samples...'
                    : orchestraStatus === 'playing'
                      ? 'Stop'
                      : 'Play Orchestra'
                  : isPlaying
                    ? 'Stop'
                    : isMusicMode
                      ? 'Play Track'
                      : 'Play Mix'}
              </span>
            </button>

            <button
              type="button"
              className="btn-secondary sfx-synth-btn"
              onClick={() => {
                if (isOrchestraMode) {
                  void playOrchestraScore();
                } else if (isAcousticMode) {
                  void composeAcousticTrack(
                    bgmChannels,
                    bgmBpm,
                    bgmKey,
                    bgmStepCount,
                    bgmLoops,
                    hallReverb,
                    warmth,
                    compositionTitle,
                    true
                  );
                } else if (isBgmMode) {
                  void composeBgmTrack(
                    bgmChannels,
                    bgmBpm,
                    bgmKey,
                    bgmStepCount,
                    bgmLoops,
                    masterEffects,
                    compositionTitle,
                    true
                  );
                } else if (isLayeredMode) {
                  void synthesizeLayeredSound(layers, masterEffects, compositionTitle, true);
                } else {
                  void synthesizeSound(editorParams, true);
                }
              }}
              disabled={isSynthesizing || orchestraStatus === 'loading'}
              title={
                isOrchestraMode
                  ? 'Reload sampled instruments and audition score'
                  : 'Re-calculate and render audio buffer'
              }
            >
              <IconAudioWave />
              <span>
                {isOrchestraMode
                  ? orchestraStatus === 'loading'
                    ? 'Loading...'
                    : 'Audition Score'
                  : isSynthesizing
                    ? 'Rendering...'
                    : isAcousticMode
                      ? 'Render Acoustic'
                      : isBgmMode
                        ? 'Render BGM'
                        : 'Re-Synthesize'}
              </span>
            </button>

            {isOrchestraMode ? (
              <button
                type="button"
                className="btn-ghost sfx-download-btn"
                onClick={() => void handleExportOrchestraWav()}
                disabled={isSynthesizing}
                title="Offline render 44.1kHz stereo WAV via smplr"
              >
                <IconDownload />
                <span>{isSynthesizing ? 'Exporting...' : 'Export Studio WAV'}</span>
              </button>
            ) : (
              currentAudioUri && (
                <a
                  href={currentAudioUri}
                  download={`${compositionTitle.toLowerCase().replace(/\s+/g, '-')}.wav`}
                  className="btn-ghost sfx-download-btn"
                  title="Download 16-bit PCM WAV"
                >
                  <IconDownload />
                  <span>Export WAV</span>
                </a>
              )
            )}
          </div>
        </div>

        {/* Live Canvas Waveform / Sequencer Visualizer */}
        <div className="sfx-visualizer-container">
          <canvas
            ref={canvasRef}
            width={720}
            height={100}
            className="sfx-canvas"
          />
          <div className="sfx-canvas-overlay">
            <span className="sfx-formula-text">
              {isOrchestraMode ? (
                <>
                  REAL SAMPLED ORCHESTRA: {orchestraScore.bpm} BPM • {orchestraScore.key} • Hall Reverb{' '}
                  {Math.round((orchestraScore.reverb || 0) * 100)}% (
                  {orchestraScore.tracks.map((t) => `${t.name} [${t.instrument}]`).join(' + ')})
                  {orchestraStatusText ? ` — ${orchestraStatusText}` : ''}
                </>
              ) : isAcousticMode ? (
                <>
                  ACOUSTIC ENSEMBLE (STEREO): {bgmBpm} BPM • {bgmKey} • Hall Reverb {Math.round(hallReverb * 100)}% ({bgmChannels.map((c) => `${c.name} [${c.instrument}]`).join(' + ')})
                </>
              ) : isBgmMode ? (
                <>
                  BGM SEQUENCER: {bgmBpm} BPM • {bgmKey} • {bgmStepCount} Steps × {bgmLoops} Loops ({bgmChannels.map((c) => c.name).join(' + ')})
                </>
              ) : isLayeredMode ? (
                <>
                  <IconLayers style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  MASTER MIX: {layers.map((l) => `${l.name} [${l.waveform}]`).join(' + ')}
                  {masterEffects.masterDistortion > 0 && ` • OD: ${Math.round(masterEffects.masterDistortion * 100)}%`}
                  {masterEffects.masterFilter < 18000 && ` • LPF: ${masterEffects.masterFilter}Hz`}
                </>
              ) : (
                <>
                  f(t) = {editorParams.waveform.toUpperCase()} [{editorParams.frequency}Hz]
                  {editorParams.freqSlide !== 0 && ` • sweep: ${editorParams.freqSlide}Hz/s`}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="sfx-mode-tabs">
          <button
            type="button"
            className={`sfx-tab-btn ${isLayeredMode ? 'active' : ''}`}
            onClick={() => {
              stopOrchestra();
              setStudioMode('layered');
            }}
          >
            <IconLayers />
            <span>Multi-Layer SFX</span>
            <span className="sfx-tab-count">{layers.length}</span>
          </button>
          <button
            type="button"
            className={`sfx-tab-btn ${isOrchestraMode ? 'active' : ''}`}
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              setIsPlaying(false);
              setStudioMode('orchestra');
              setPresetTab('orchestra');
              if (orchestraScore.songName) {
                setCompositionTitle(orchestraScore.songName);
              }
            }}
          >
            <IconSpark />
            <span>Real Orchestra</span>
            <span className="sfx-tab-count">SMPLR</span>
          </button>
          <button
            type="button"
            className={`sfx-tab-btn ${isAcousticMode ? 'active' : ''}`}
            onClick={() => {
              stopOrchestra();
              setStudioMode('acoustic');
              setPresetTab('acoustic');
              if (!bgmChannels.some((c) => ['piano', 'guitar', 'strings', 'flute', 'brass', 'harp', 'epiano'].includes(c.instrument)) && acousticPresets[0]) {
                loadAcousticPreset(acousticPresets[0]);
              }
            }}
          >
            <IconSpark />
            <span>Acoustic Studio</span>
            <span className="sfx-tab-count">DSP</span>
          </button>
          <button
            type="button"
            className={`sfx-tab-btn ${isBgmMode ? 'active' : ''}`}
            onClick={() => {
              stopOrchestra();
              setStudioMode('bgm');
              setPresetTab('bgm');
            }}
          >
            <IconAudioWave />
            <span>BGM Chiptune</span>
            <span className="sfx-tab-count">{bgmChannels.length}</span>
          </button>
          <button
            type="button"
            className={`sfx-tab-btn ${studioMode === 'single' ? 'active' : ''}`}
            onClick={() => {
              stopOrchestra();
              setStudioMode('single');
            }}
          >
            <IconSliders />
            <span>Single Oscillator</span>
          </button>
        </div>

        {/* Real Sampled Orchestra Studio (smplr SoundFonts + SplendidGrandPiano + TR-808) */}
        {isOrchestraMode && (
          <div className="sfx-layers-rack sfx-orchestra-rack">
            <div className="sfx-rack-header">
              <span className="sfx-rack-title">
                <IconSpark />
                <span>Real Sampled Orchestra (FluidR3_GM + Splendid Grand Piano)</span>
              </span>
              <div className="sfx-bgm-transport">
                <label className="sfx-bpm-control">
                  <span>BPM</span>
                  <input
                    type="number"
                    min={45}
                    max={195}
                    value={orchestraScore.bpm}
                    onChange={(e) => {
                      const nextBpm = Math.min(195, Math.max(45, Number(e.target.value) || 84));
                      setOrchestraScore((prev) => ({ ...prev, bpm: nextBpm }));
                    }}
                  />
                </label>
                <label className="sfx-bpm-control">
                  <span>Key</span>
                  <input
                    type="text"
                    value={orchestraScore.key}
                    onChange={(e) =>
                      setOrchestraScore((prev) => ({ ...prev, key: e.target.value }))
                    }
                    style={{ width: 76 }}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost sfx-solo-btn"
                  onClick={handleAddOrchestraTrack}
                  title="Add another sampled orchestra instrument"
                >
                  <IconPlus />
                  <span>Add Instrument</span>
                </button>
              </div>
            </div>

            {orchestraScore.tracks.map((tr) => {
              const notePreview = tr.notes
                .slice(0, 10)
                .map((n) => n.note)
                .join(' · ');
              return (
                <div key={tr.id} className={`sfx-bgm-channel-row ${tr.muted ? 'muted' : ''}`}>
                  <div className="sfx-bgm-channel-meta">
                    <div className="sfx-bgm-channel-top">
                      <input
                        type="text"
                        className="sfx-layer-name-input"
                        value={tr.name}
                        onChange={(e) =>
                          handleUpdateOrchestraTrack(tr.id, { name: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className={`sfx-solo-btn ${tr.muted ? 'active' : ''}`}
                        onClick={() =>
                          handleUpdateOrchestraTrack(tr.id, { muted: !tr.muted })
                        }
                      >
                        {tr.muted ? 'Muted' : 'Mute'}
                      </button>
                      {orchestraScore.tracks.length > 1 && (
                        <button
                          type="button"
                          className="sfx-solo-btn"
                          onClick={() => handleRemoveOrchestraTrack(tr.id)}
                          title="Remove track"
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>

                    <div className="sfx-bgm-channel-sub">
                      <select
                        className="sfx-inst-select"
                        value={tr.instrument}
                        onChange={(e) =>
                          handleUpdateOrchestraTrack(tr.id, { instrument: e.target.value })
                        }
                      >
                        {(
                          [
                            'Piano & Keys',
                            'Strings',
                            'Winds & Brass',
                            'Choir & Organ',
                            'Plucked & Mallets',
                            'Drums',
                          ] as const
                        ).map((cat) => (
                          <optgroup key={cat} label={cat}>
                            {ORCHESTRA_INSTRUMENT_OPTIONS.filter((o) => o.category === cat).map(
                              (opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              )
                            )}
                          </optgroup>
                        ))}
                      </select>
                      <input
                        type="range"
                        min="0"
                        max="1.25"
                        step="0.05"
                        value={tr.volume}
                        onChange={(e) =>
                          handleUpdateOrchestraTrack(tr.id, {
                            volume: parseFloat(e.target.value),
                          })
                        }
                        title={`Volume: ${Math.round(tr.volume * 100)}%`}
                      />
                    </div>

                    <div
                      className="sfx-bgm-channel-sub"
                      style={{ fontSize: 10, color: 'var(--text-muted)' }}
                    >
                      <span>Pan</span>
                      <input
                        type="range"
                        min="-0.85"
                        max="0.85"
                        step="0.05"
                        value={tr.pan ?? 0}
                        onChange={(e) =>
                          handleUpdateOrchestraTrack(tr.id, {
                            pan: parseFloat(e.target.value),
                          })
                        }
                        title={`Pan: ${tr.pan ?? 0}`}
                      />
                      <span className="mono-value">{tr.notes.length} notes</span>
                    </div>
                  </div>

                  {/* Mini Horizontal Score Timeline for this Track */}
                  <div className="sfx-orchestra-track-roll">
                    <div className="sfx-orchestra-roll-bar">
                      {tr.notes.map((ev, nIdx) => {
                        const totalB = Math.max(orchestraScore.totalBeats || 16, 8);
                        const leftPct = Math.min(98, Math.max(0, (ev.beat / totalB) * 100));
                        const widthPct = Math.max(
                          2.2,
                          Math.min(100 - leftPct, (ev.durationBeats / totalB) * 100)
                        );
                        return (
                          <span
                            key={`${tr.id}-n-${nIdx}`}
                            className="sfx-orchestra-note-block"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              opacity: Math.max(0.45, Math.min(1, (ev.velocity || 84) / 115)),
                            }}
                            title={`${ev.note} @ beat ${ev.beat} (${ev.durationBeats}b)`}
                          >
                            {ev.note}
                          </span>
                        );
                      })}
                    </div>
                    <div className="sfx-orchestra-note-summary">
                      {notePreview}
                      {tr.notes.length > 10 ? ` ... (+${tr.notes.length - 10} more)` : ''}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="sfx-master-effects-bar">
              <span className="sfx-master-title">Real Hall Space & Tempo</span>
              <div className="sfx-master-sliders">
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Convolution Hall Reverb</span>
                    <span className="mono-value">
                      {Math.round((orchestraScore.reverb || 0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.75"
                    step="0.05"
                    value={orchestraScore.reverb ?? 0.42}
                    onChange={(e) =>
                      setOrchestraScore((prev) => ({
                        ...prev,
                        reverb: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Total Score Length</span>
                    <span className="mono-value">
                      {orchestraScore.totalBeats} Beats ({computeEffectiveScoreDuration(orchestraScore).toFixed(1)}s)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="64"
                    step="4"
                    value={orchestraScore.totalBeats || 16}
                    onChange={(e) =>
                      setOrchestraScore((prev) => ({
                        ...prev,
                        totalBeats: parseInt(e.target.value, 10),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shared Multi-Channel Step Sequencer (Chiptune BGM OR Physical-Modeling Acoustic Studio) */}
        {isMusicMode && !isOrchestraMode && (
          <div className="sfx-layers-rack sfx-bgm-rack">
            <div className="sfx-rack-header">
              <span className="sfx-rack-title">
                {isAcousticMode ? <IconSpark /> : <IconAudioWave />}
                <span>
                  {isAcousticMode
                    ? 'Physical-Modeling Acoustic Ensemble (Polyphonic Chords & Stereo)'
                    : 'Chiptune Pattern Sequencer'}
                </span>
              </span>
              <div className="sfx-bgm-transport">
                <label className="sfx-bpm-control">
                  <span>BPM</span>
                  <input
                    type="number"
                    min={55}
                    max={210}
                    value={bgmBpm}
                    onChange={(e) =>
                      setBgmBpm(Math.min(210, Math.max(55, Number(e.target.value) || 100)))
                    }
                  />
                </label>
                <label className="sfx-bpm-control">
                  <span>Key</span>
                  <input
                    type="text"
                    value={bgmKey}
                    onChange={(e) => setBgmKey(e.target.value)}
                    style={{ width: 76 }}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost sfx-solo-btn"
                  onClick={handleAddBgmChannel}
                  title="Add a new instrument track"
                >
                  <IconPlus />
                  <span>Add Track</span>
                </button>
              </div>
            </div>

            {bgmChannels.map((ch) => (
              <div key={ch.id} className={`sfx-bgm-channel-row ${ch.muted ? 'muted' : ''}`}>
                <div className="sfx-bgm-channel-meta">
                  <div className="sfx-bgm-channel-top">
                    <input
                      type="text"
                      className="sfx-layer-name-input"
                      value={ch.name}
                      onChange={(e) =>
                        handleUpdateBgmChannel(ch.id, { name: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className={`sfx-solo-btn ${ch.muted ? 'active' : ''}`}
                      onClick={() =>
                        handleUpdateBgmChannel(ch.id, { muted: !ch.muted })
                      }
                      title="Mute / Unmute channel"
                    >
                      {ch.muted ? 'Muted' : 'Mute'}
                    </button>
                    {bgmChannels.length > 1 && (
                      <button
                        type="button"
                        className="sfx-solo-btn"
                        onClick={() => handleRemoveBgmChannel(ch.id)}
                        title="Remove channel"
                      >
                        <IconTrash />
                      </button>
                    )}
                  </div>

                  <div className="sfx-bgm-channel-sub">
                    <select
                      className="sfx-inst-select"
                      value={ch.instrument}
                      onChange={(e) =>
                        handleUpdateBgmChannel(ch.id, { instrument: e.target.value })
                      }
                    >
                      <optgroup label="Acoustic Physical-Modeling">
                        <option value="piano">piano (Grand)</option>
                        <option value="epiano">epiano (Rhodes)</option>
                        <option value="guitar">guitar (Plucked)</option>
                        <option value="harp">harp (String)</option>
                        <option value="strings">strings (Ensemble)</option>
                        <option value="flute">flute (Woodwind)</option>
                        <option value="brass">brass (Horn)</option>
                        <option value="acoustic_kick">acoustic_kick</option>
                        <option value="acoustic_snare">acoustic_snare</option>
                        <option value="acoustic_hihat">acoustic_hihat</option>
                      </optgroup>
                      <optgroup label="Chiptune / Synth">
                        <option value="square">square</option>
                        <option value="sawtooth">sawtooth</option>
                        <option value="triangle">triangle</option>
                        <option value="sine">sine</option>
                        <option value="fm">fm</option>
                        <option value="noise">noise (drums)</option>
                        <option value="kick">kick</option>
                        <option value="snare">snare</option>
                        <option value="hihat">hihat</option>
                      </optgroup>
                    </select>
                    <input
                      type="range"
                      min="0"
                      max="1.2"
                      step="0.05"
                      value={ch.volume}
                      onChange={(e) =>
                        handleUpdateBgmChannel(ch.id, {
                          volume: parseFloat(e.target.value),
                        })
                      }
                      title={`Volume: ${Math.round(ch.volume * 100)}%`}
                    />
                  </div>

                  {isAcousticMode && (
                    <div className="sfx-bgm-channel-sub" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>Pan</span>
                      <input
                        type="range"
                        min="-0.8"
                        max="0.8"
                        step="0.1"
                        value={ch.pan ?? 0}
                        onChange={(e) =>
                          handleUpdateBgmChannel(ch.id, {
                            pan: parseFloat(e.target.value),
                          })
                        }
                        title={`Stereo Pan: ${ch.pan ?? 0}`}
                      />
                      <span className="mono-value" style={{ fontSize: 9.5, width: 28, textAlign: 'right' }}>
                        {(ch.pan ?? 0) === 0 ? 'C' : (ch.pan ?? 0) < 0 ? `L${Math.round(Math.abs(ch.pan ?? 0) * 10)}` : `R${Math.round((ch.pan ?? 0) * 10)}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="sfx-bgm-steps-grid">
                  {ch.steps.slice(0, bgmStepCount).map((stepVal, sIdx) => {
                    const isActive = stepVal && stepVal !== '-';
                    const isSustain = stepVal === '~';
                    const isBeatStart = sIdx % 4 === 0;
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        className={`sfx-step-cell ${isActive ? 'active' : ''} ${isSustain ? 'sustain' : ''} ${isBeatStart ? 'beat-start' : ''}`}
                        onClick={() => handleToggleBgmStep(ch.id, sIdx)}
                        title={`Step ${sIdx + 1}: ${stepVal || 'Rest'} (click to toggle)`}
                      >
                        {isActive ? stepVal : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Master Bus Strip */}
            {isAcousticMode ? (
              <div className="sfx-master-strip" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Concert Hall Reverb (Stereo)</span>
                    <span className="mono-value">{Math.round(hallReverb * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.7"
                    step="0.05"
                    value={hallReverb}
                    onChange={(e) => setHallReverb(parseFloat(e.target.value))}
                  />
                </div>
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Analog Harmonic Warmth</span>
                    <span className="mono-value">{Math.round(warmth * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={warmth}
                    onChange={(e) => setWarmth(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <div className="sfx-master-strip">
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Master Overdrive</span>
                    <span className="mono-value">
                      {Math.round(masterEffects.masterDistortion * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.6"
                    step="0.05"
                    value={masterEffects.masterDistortion}
                    onChange={(e) =>
                      setMasterEffects((fx) => ({
                        ...fx,
                        masterDistortion: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Master Filter</span>
                    <span className="mono-value">
                      {masterEffects.masterFilter >= 20000
                        ? 'Open'
                        : `${masterEffects.masterFilter}Hz`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="20000"
                    step="500"
                    value={masterEffects.masterFilter}
                    onChange={(e) =>
                      setMasterEffects((fx) => ({
                        ...fx,
                        masterFilter: parseInt(e.target.value, 10),
                      }))
                    }
                  />
                </div>
                <div className="slider-group">
                  <div className="slider-label-row">
                    <span>Master Space Reverb</span>
                    <span className="mono-value">
                      {Math.round(masterEffects.masterReverb * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.7"
                    step="0.05"
                    value={masterEffects.masterReverb}
                    onChange={(e) =>
                      setMasterEffects((fx) => ({
                        ...fx,
                        masterReverb: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Multi-Layer Track Rack */}
        {isLayeredMode && (
          <div className="sfx-layers-rack">
            <div className="sfx-rack-header">
              <span className="sfx-rack-title">
                <IconLayers />
                <span>Multi-Track Layer Mixer</span>
              </span>
              <div className="sfx-rack-actions">
                <button
                  type="button"
                  className="btn-ghost sfx-solo-btn"
                  onClick={handleAddLayer}
                  title="Add a new sound layer"
                >
                  <IconPlus />
                  <span>Add Layer</span>
                </button>
              </div>
            </div>

            {/* List of Layer Tracks */}
            {layers.map((layer) => {
              const isSelected = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  className={`sfx-layer-track ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectLayer(layer)}
                >
                  <div className="sfx-layer-track-left">
                    <span className={`sfx-waveform-badge ${layer.waveform}`}>
                      {layer.waveform}
                    </span>
                    <input
                      type="text"
                      className="sfx-layer-name-input"
                      value={layer.name}
                      onChange={(e) =>
                        handleUpdateLayerMeta(layer.id, { name: e.target.value })
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="sfx-layer-delay-badge" title="Start delay offset">
                      ⏱ {layer.delay > 0 ? `+${layer.delay.toFixed(2)}s` : '0.00s'}
                    </span>
                  </div>

                  <div
                    className="sfx-layer-vol-group"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="mono-value" style={{ fontSize: 10 }}>
                      {Math.round(layer.volume * 100)}%
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.05"
                      value={layer.volume}
                      onChange={(e) =>
                        handleUpdateLayerMeta(layer.id, {
                          volume: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="sfx-layer-track-actions" onClick={(e) => e.stopPropagation()}>
                    {layer.dataUri && (
                      <button
                        type="button"
                        className="sfx-solo-btn"
                        onClick={() => playAudio(layer.dataUri)}
                        title="Audition this layer solo"
                      >
                        <IconVolume2 />
                        <span>Solo</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className={`sfx-solo-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectLayer(layer)}
                      title="Edit this layer's parameters below"
                    >
                      <IconSliders />
                      <span>{isSelected ? 'Editing' : 'Edit'}</span>
                    </button>

                    {layers.length > 1 && (
                      <button
                        type="button"
                        className="sfx-solo-btn"
                        onClick={() => handleRemoveLayer(layer.id)}
                        title="Delete layer"
                      >
                        <IconTrash />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Master DSP Strip */}
            <div className="sfx-master-strip">
              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Master Overdrive</span>
                  <span className="mono-value">
                    {Math.round(masterEffects.masterDistortion * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={masterEffects.masterDistortion}
                  onChange={(e) =>
                    setMasterEffects((fx) => ({
                      ...fx,
                      masterDistortion: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Master Filter</span>
                  <span className="mono-value">
                    {masterEffects.masterFilter >= 20000
                      ? 'Open'
                      : `${masterEffects.masterFilter}Hz`}
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="20000"
                  step="500"
                  value={masterEffects.masterFilter}
                  onChange={(e) =>
                    setMasterEffects((fx) => ({
                      ...fx,
                      masterFilter: parseInt(e.target.value, 10),
                    }))
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Master Space Reverb</span>
                  <span className="mono-value">
                    {Math.round(masterEffects.masterReverb * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.7"
                  step="0.05"
                  value={masterEffects.masterReverb}
                  onChange={(e) =>
                    setMasterEffects((fx) => ({
                      ...fx,
                      masterReverb: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Curated Presets Shelf */}
        <div className="sfx-presets-shelf">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'layered' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('layered')}
            >
              Layered SFX
            </button>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'orchestra' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('orchestra')}
            >
              Real Orchestra
            </button>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'acoustic' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('acoustic')}
            >
              Acoustic Synth
            </button>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'bgm' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('bgm')}
            >
              BGM Chiptune
            </button>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'single' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('single')}
            >
              Single SFX
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
            {presetTab === 'orchestra'
              ? orchestraPresets.map((op, idx) => (
                  <button
                    key={op.id || `${op.songName}-${idx}`}
                    type="button"
                    className="sfx-preset-pill"
                    onClick={() => loadOrchestraPreset(op)}
                    title={op.description || `${op.bpm} BPM • ${op.key} • ${op.tracks.map((t) => t.instrument).join(', ')}`}
                  >
                    🎼 {op.songName || op.name}
                  </button>
                ))
                : presetTab === 'acoustic'
                  ? acousticPresets.map((ap) => (
                    <button
                      key={ap.id}
                      type="button"
                      className="sfx-preset-pill"
                      onClick={() => loadAcousticPreset(ap)}
                      title={ap.description}
                    >
                      🎻 {ap.name}
                    </button>
                  ))
                : presetTab === 'bgm'
                  ? bgmPresets.map((bp) => (
                      <button
                        key={bp.id}
                        type="button"
                        className="sfx-preset-pill"
                        onClick={() => loadBgmPreset(bp)}
                        title={bp.description}
                      >
                        🎵 {bp.name}
                      </button>
                    ))
                  : presetTab === 'layered'
                    ? layeredPresets.map((lp) => (
                      <button
                        key={lp.id}
                        type="button"
                        className="sfx-preset-pill"
                        onClick={() => loadLayeredPreset(lp)}
                        title={lp.description}
                      >
                        ✨ {lp.name}
                      </button>
                    ))
                    : presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="sfx-preset-pill"
                        onClick={() => loadSinglePreset(preset)}
                        title={preset.description}
                      >
                        {preset.name}
                      </button>
                    ))}
          </div>
        </div>

        {/* Mathematical Controls Grid (Edits Selected Layer or Single Oscillator) */}
        {!isMusicMode && (
          <div className="sfx-controls-grid">
            {/* Box 1: Mathematical Waveform Oscillator */}
            <div className="sfx-control-card">
              <div className="card-header">
                <span className="card-title">
                  1. Oscillator {isLayeredMode ? `(${selectedLayer.name})` : ''}
                </span>
                <span className="card-badge">{editorParams.waveform}</span>
              </div>

              <div className="waveform-buttons-row">
                {(['square', 'sine', 'sawtooth', 'triangle', 'noise', 'fm'] as const).map(
                  (w) => (
                    <button
                      key={w}
                      type="button"
                      className={`waveform-btn ${editorParams.waveform === w ? 'active' : ''}`}
                      onClick={() => {
                        handleParamChange((p) => ({ ...p, waveform: w }));
                      }}
                    >
                      {w.toUpperCase()}
                    </button>
                  )
                )}
              </div>

              {editorParams.waveform === 'square' && (
                <div className="slider-group" style={{ marginTop: 8 }}>
                  <div className="slider-label-row">
                    <span>Duty Cycle (Pulse Width)</span>
                    <span className="mono-value">
                      {Math.round((editorParams.dutyCycle ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={editorParams.dutyCycle ?? 0.5}
                    onChange={(e) => {
                      handleParamChange((p) => ({
                        ...p,
                        dutyCycle: parseFloat(e.target.value),
                      }));
                    }}
                  />
                </div>
              )}
            </div>

            {/* Box 2: Frequency & Pitch Sweep */}
            <div className="sfx-control-card">
              <div className="card-header">
                <span className="card-title">2. Frequency & Pitch Slide</span>
                <span className="card-badge">{editorParams.frequency} Hz</span>
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Base Frequency</span>
                  <span className="mono-value">{editorParams.frequency} Hz</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="3500"
                  step="10"
                  value={editorParams.frequency}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      frequency: parseInt(e.target.value, 10),
                    }))
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Pitch Slide (Sweep)</span>
                  <span className="mono-value">
                    {editorParams.freqSlide > 0 ? '+' : ''}
                    {editorParams.freqSlide} Hz/s
                  </span>
                </div>
                <input
                  type="range"
                  min="-4500"
                  max="3500"
                  step="50"
                  value={editorParams.freqSlide}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      freqSlide: parseInt(e.target.value, 10),
                    }))
                  }
                />
              </div>
            </div>

            {/* Box 3: ADSR Envelopes */}
            <div className="sfx-control-card">
              <div className="card-header">
                <span className="card-title">3. ADSR Envelope</span>
                <span className="card-badge">
                  {(editorParams.duration || 0.25).toFixed(2)}s Duration
                </span>
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Layer Duration</span>
                  <span className="mono-value">
                    {(editorParams.duration || 0.25).toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="2.5"
                  step="0.05"
                  value={editorParams.duration}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      duration: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="adsr-grid">
                <div className="slider-subgroup">
                  <span className="subgroup-label">
                    Attack ({(editorParams.attack * 1000).toFixed(0)}ms)
                  </span>
                  <input
                    type="range"
                    min="0.001"
                    max="0.4"
                    step="0.005"
                    value={editorParams.attack}
                    onChange={(e) =>
                      handleParamChange((p) => ({
                        ...p,
                        attack: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="slider-subgroup">
                  <span className="subgroup-label">
                    Decay ({(editorParams.decay * 1000).toFixed(0)}ms)
                  </span>
                  <input
                    type="range"
                    min="0.01"
                    max="0.8"
                    step="0.01"
                    value={editorParams.decay}
                    onChange={(e) =>
                      handleParamChange((p) => ({
                        ...p,
                        decay: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="slider-subgroup">
                  <span className="subgroup-label">
                    Sustain ({Math.round(editorParams.sustain * 100)}%)
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={editorParams.sustain}
                    onChange={(e) =>
                      handleParamChange((p) => ({
                        ...p,
                        sustain: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="slider-subgroup">
                  <span className="subgroup-label">
                    Release ({(editorParams.release * 1000).toFixed(0)}ms)
                  </span>
                  <input
                    type="range"
                    min="0.01"
                    max="1.0"
                    step="0.01"
                    value={editorParams.release}
                    onChange={(e) =>
                      handleParamChange((p) => ({
                        ...p,
                        release: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Box 4: DSP Filters & Effects */}
            <div className="sfx-control-card">
              <div className="card-header">
                <span className="card-title">4. Filters & Post-Processing</span>
                <span className="card-badge">Effects</span>
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Low-Pass Cutoff</span>
                  <span className="mono-value">
                    {editorParams.filterCutoff || 20000} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min="400"
                  max="20000"
                  step="200"
                  value={editorParams.filterCutoff || 20000}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      filterCutoff: parseInt(e.target.value, 10),
                    }))
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Layer Distortion</span>
                  <span className="mono-value">
                    {Math.round((editorParams.distortion || 0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={editorParams.distortion || 0}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      distortion: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="slider-group">
                <div className="slider-label-row">
                  <span>Comb Reverb</span>
                  <span className="mono-value">
                    {Math.round((editorParams.reverb || 0) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.75"
                  step="0.05"
                  value={editorParams.reverb || 0}
                  onChange={(e) =>
                    handleParamChange((p) => ({
                      ...p,
                      reverb: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
