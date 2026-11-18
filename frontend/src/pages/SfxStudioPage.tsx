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
  IconDownload,
  IconLayers,
  IconPause,
  IconPlay,
  IconPlus,
  IconSend,
  IconSliders,
  IconTrash,
  IconVolume2,
} from '../components/Icons';

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

export interface SfxMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  dataUri?: string;
  params?: SfxParams;
  soundName?: string;
  toolStatus?: string;
  isLayered?: boolean;
  layers?: SfxLayer[];
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

const PROMPT_CHIPS = [
  'Combine a laser zap attack with a deep sub-bass explosion',
  'Synthesize a 3-layer legendary treasure chest fanfare',
  'Create a seismic meteor strike with shockwave & sub-rumble',
  'Engineer a cyberpunk warp dash with Doppler static',
  'Design an alien energy shield deflect with metallic shimmer',
];

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function SfxStudioPage() {
  // Mode: Single Oscillator vs Multi-Layer Stack
  const [isLayeredMode, setIsLayeredMode] = useState(true);
  const [layers, setLayers] = useState<SfxLayer[]>(INITIAL_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(INITIAL_LAYERS[0].id);
  const [masterEffects, setMasterEffects] = useState<MasterEffects>({
    masterReverb: 0.25,
    masterDistortion: 0.15,
    masterFilter: 16000,
  });

  const [editorParams, setEditorParams] = useState<SfxParams>(INITIAL_LAYERS[0].params);
  const [compositionTitle, setCompositionTitle] = useState('Sci-Fi Plasma Cannon');
  const [currentAudioUri, setCurrentAudioUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [layeredPresets, setLayeredPresets] = useState<LayeredPreset[]>([]);
  const [presetTab, setPresetTab] = useState<'layered' | 'single'>('layered');

  // Agent Chat State
  const [chatInput, setChatInput] = useState('');
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [messages, setMessages] = useState<SfxMessage[]>([
    {
      id: 'welcome-sfx',
      role: 'assistant',
      content:
        'Welcome to **VectorMind Game SFX Studio**! I am your AI sound engineer. I can design single DSP sounds or **combine multiple acoustic layers** (transient attack punch, tonal core body, sub-rumble, and ambient tail) into rich, composite game audio.\n\nDescribe any sound effect or click one of the multi-layer archetypes below to get started!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const playAudio = useCallback((uri?: string) => {
    const targetUri = uri || currentAudioUri;
    if (!targetUri) return;

    if (audioRef.current) {
      audioRef.current.src = targetUri;
      audioRef.current.play().catch(() => { });
      setIsPlaying(true);
    }
  }, [currentAudioUri]);

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

  // Load presets on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/sfx/presets`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          if (Array.isArray(data.presets)) setPresets(data.presets);
          if (Array.isArray(data.layeredPresets)) setLayeredPresets(data.layeredPresets);
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
    setIsLayeredMode(false);
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
    setIsLayeredMode(true);
    void synthesizeLayeredSound(formattedLayers, fx, preset.name, true);
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
  }, [editorParams, layers, isLayeredMode, isPlaying]);

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
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setChatInput('');
    setIsAgentThinking(true);
    setActiveTool('Connecting to Procedural Audio Synthesizer...');

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
          if (eventName === 'tool') {
            setActiveTool(`Synthesizing sound: ${data.name}...`);
          } else if (eventName === 'tool_result') {
            if (
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
                      layers: resLayers,
                      masterEffects: masterFx,
                    }
                    : m
                )
              );

              // Update Center Editor to Layered Mode
              setIsLayeredMode(true);
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
                    }
                    : m
                )
              );

              setIsLayeredMode(false);
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
                  ? { ...m, content: m.content + (data.text || '') }
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

                  <div className="sfx-text-body">{msg.content}</div>

                  {/* Playable Inline Sound Card generated by Agent */}
                  {msg.dataUri && (
                    <div className="sfx-inline-player-card">
                      <div className="sfx-inline-player-header">
                        <span className="sfx-sound-name">
                          {msg.isLayered ? <IconLayers /> : <IconAudioWave />}
                          <span>{msg.soundName || 'Composite SFX'}</span>
                        </span>
                        <span className="sfx-sound-waveform">
                          {msg.isLayered ? `${msg.layers?.length || 3} LAYERS` : msg.params?.waveform?.toUpperCase() || 'DSP'}
                        </span>
                      </div>

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
                          onClick={() => playAudio(msg.dataUri)}
                        >
                          <IconPlay />
                          <span>Play Mix</span>
                        </button>

                        <button
                          type="button"
                          className="btn-ghost sfx-load-editor-btn"
                          onClick={() => {
                            if (msg.isLayered && msg.layers) {
                              setIsLayeredMode(true);
                              setCompositionTitle(msg.soundName || 'Layered Composition');
                              setLayers(msg.layers);
                              if (msg.layers[0]) {
                                setSelectedLayerId(msg.layers[0].id);
                                setEditorParams(msg.layers[0].params);
                              }
                              if (msg.masterEffects) setMasterEffects(msg.masterEffects);
                            } else if (msg.params) {
                              setIsLayeredMode(false);
                              setCompositionTitle(msg.soundName || 'Custom SFX');
                              setEditorParams({ ...msg.params, soundName: msg.soundName });
                            }
                            if (msg.dataUri) {
                              setCurrentAudioUri(msg.dataUri);
                            }
                          }}
                          title="Load this multi-layer sound into the center editor"
                        >
                          <IconSliders />
                          <span>Load in Editor</span>
                        </button>

                        <a
                          href={msg.dataUri}
                          download={`${(msg.soundName || 'game-sfx').toLowerCase().replace(/\s+/g, '-')}.wav`}
                          className="btn-ghost sfx-download-link"
                          title="Download 16-bit WAV"
                        >
                          <IconDownload />
                          <span>WAV</span>
                        </a>
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
              title="Click to rename sound composition"
            />
            <span className="sfx-duration-pill">
              {isLayeredMode
                ? `${layers.length} Layers • 44.1kHz 16-bit PCM`
                : `${(editorParams.duration || 0.25).toFixed(2)}s • 44.1kHz`}
            </span>
          </div>

          <div className="sfx-header-actions">
            <button
              type="button"
              className={`btn-primary sfx-main-play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => {
                if (isPlaying) {
                  audioRef.current?.pause();
                  setIsPlaying(false);
                } else {
                  playAudio();
                }
              }}
              title="Play master audio composition"
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
              <span>{isPlaying ? 'Stop' : 'Play Mix'}</span>
            </button>

            <button
              type="button"
              className="btn-secondary sfx-synth-btn"
              onClick={() => {
                if (isLayeredMode) {
                  void synthesizeLayeredSound(layers, masterEffects, compositionTitle, true);
                } else {
                  void synthesizeSound(editorParams, true);
                }
              }}
              disabled={isSynthesizing}
              title="Re-calculate and render audio buffer"
            >
              <IconAudioWave />
              <span>{isSynthesizing ? 'Rendering...' : 'Re-Synthesize'}</span>
            </button>

            {currentAudioUri && (
              <a
                href={currentAudioUri}
                download={`${compositionTitle.toLowerCase().replace(/\s+/g, '-')}.wav`}
                className="btn-ghost sfx-download-btn"
                title="Download 16-bit PCM WAV"
              >
                <IconDownload />
                <span>Export WAV</span>
              </a>
            )}
          </div>
        </div>

        {/* Live Canvas Waveform Oscilloscope */}
        <div className="sfx-visualizer-container">
          <canvas
            ref={canvasRef}
            width={720}
            height={100}
            className="sfx-canvas"
          />
          <div className="sfx-canvas-overlay">
            <span className="sfx-formula-text">
              {isLayeredMode ? (
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
            onClick={() => setIsLayeredMode(true)}
          >
            <IconLayers />
            <span>Multi-Layer Stack</span>
            <span className="sfx-tab-count">{layers.length}</span>
          </button>
          <button
            type="button"
            className={`sfx-tab-btn ${!isLayeredMode ? 'active' : ''}`}
            onClick={() => setIsLayeredMode(false)}
          >
            <IconSliders />
            <span>Single Oscillator</span>
          </button>
        </div>

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
              Multi-Layer Archetypes
            </button>
            <button
              type="button"
              className={`sfx-tab-btn ${presetTab === 'single' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => setPresetTab('single')}
            >
              Single Presets
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
            {presetTab === 'layered'
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
      </div>
    </div>
  );
}
