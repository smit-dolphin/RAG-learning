/**
 * Mathematical Procedural Audio Synthesizer
 * Generates game sound effects using mathematical functions and DSP equations.
 * Produces 16-bit PCM WAV buffers with zero external dependencies.
 */

const SAMPLE_RATE = 44100;

/**
 * Encode raw Float32Array PCM samples into a valid RIFF WAVE Buffer.
 */
function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const byteRate = sampleRate * 2; // 1 channel * 16-bit / 8
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Chunk Descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // "fmt " Sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // "data" Sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write 16-bit signed PCM samples
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.floor(s < 0 ? s * 32768 : s * 32767), 44 + i * 2);
  }

  return buffer;
}

/**
 * Calculate the ADSR envelope value at time `t` (0 <= t <= duration).
 */
function calculateEnvelope(t, { duration, attack, decay, sustain, release }) {
  if (t < 0 || t > duration) return 0;

  const totalSustainTime = Math.max(0, duration - (attack + decay + release));
  const sustainStart = attack + decay;
  const releaseStart = sustainStart + totalSustainTime;

  // Attack Phase: 0 -> 1.0 (exponential / smooth ramp)
  if (t < attack && attack > 0) {
    return Math.sin((t / attack) * (Math.PI / 2));
  }

  // Decay Phase: 1.0 -> sustain level
  if (t < sustainStart && decay > 0) {
    const progress = (t - attack) / decay;
    return 1.0 - (1.0 - sustain) * progress;
  }

  // Sustain Phase: hold sustain level
  if (t < releaseStart) {
    return sustain;
  }

  // Release Phase: sustain level -> 0
  if (release > 0) {
    const progress = Math.min(1, (t - releaseStart) / release);
    return Math.max(0, sustain * (1.0 - progress));
  }

  return 0;
}

/**
 * Generate raw Float32Array PCM samples for a single mathematical oscillator layer.
 */
function generateRawSamples(params = {}) {
  const duration = Math.min(Math.max(params.duration || 0.35, 0.04), 4.0);
  const baseFreq = Math.min(Math.max(params.frequency || 440, 20), 12000);
  const freqSlide = params.freqSlide || 0; // Pitch bend rate in Hz/sec
  const waveform = params.waveform || 'square'; // 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'fm'
  const dutyCycle = Math.min(Math.max(params.dutyCycle ?? 0.5, 0.1), 0.9);

  // ADSR Envelope
  const attack = Math.max(params.attack ?? 0.01, 0.001);
  const decay = Math.max(params.decay ?? 0.1, 0.001);
  const sustain = Math.min(Math.max(params.sustain ?? 0.4, 0), 1);
  const release = Math.max(params.release ?? 0.15, 0.001);

  // Modulation & Vibrato
  const vibratoRate = Math.max(params.vibratoRate || 0, 0);
  const vibratoDepth = Math.max(params.vibratoDepth || 0, 0);
  const modFreq = Math.max(params.modFrequency || 40, 1);
  const modDepth = Math.max(params.modDepth || 2.0, 0);

  // Post Effects
  const distortion = Math.min(Math.max(params.distortion || 0, 0), 1);
  const bitCrush = params.bitCrush ? Math.min(Math.max(params.bitCrush, 2), 16) : 16;
  const filterCutoff = params.filterCutoff || 20000; // Hz
  const reverb = Math.min(Math.max(params.reverb || 0, 0), 0.8);

  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float32Array(numSamples);

  let phase = 0;
  let modPhase = 0;

  // Single-pole low-pass filter coefficient
  const rc = 1.0 / (2 * Math.PI * Math.max(filterCutoff, 50));
  const dt = 1.0 / SAMPLE_RATE;
  const filterAlpha = dt / (rc + dt);
  let filterPrev = 0;

  // Comb delay line
  const delaySamples = Math.floor(SAMPLE_RATE * 0.035);
  const delayBuffer = new Float32Array(delaySamples);
  let delayIndex = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // 1. Calculate Instantaneous Frequency
    let currentFreq = baseFreq;
    if (Math.abs(freqSlide) > 0) {
      currentFreq = Math.max(20, baseFreq + freqSlide * t);
    }
    if (vibratoRate > 0 && vibratoDepth > 0) {
      currentFreq += Math.sin(2 * Math.PI * vibratoRate * t) * vibratoDepth;
    }

    phase += (2 * Math.PI * currentFreq) / SAMPLE_RATE;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

    modPhase += (2 * Math.PI * modFreq) / SAMPLE_RATE;
    if (modPhase > 2 * Math.PI) modPhase -= 2 * Math.PI;

    // 2. Compute Raw Mathematical Waveform Sample
    let rawSample = 0;
    const normalizedPhase = (phase / (2 * Math.PI)) % 1;

    switch (waveform) {
      case 'sine':
        rawSample = Math.sin(phase);
        break;

      case 'square':
        rawSample = normalizedPhase < dutyCycle ? 1.0 : -1.0;
        break;

      case 'sawtooth':
        rawSample = 2.0 * normalizedPhase - 1.0;
        break;

      case 'triangle':
        rawSample = Math.abs(4.0 * (normalizedPhase - 0.5)) - 1.0;
        break;

      case 'noise':
        rawSample = Math.random() * 2.0 - 1.0;
        break;

      case 'fm':
        rawSample = Math.sin(phase + modDepth * Math.sin(modPhase));
        break;

      default:
        rawSample = Math.sin(phase);
    }

    // 3. Apply ADSR Envelope
    const envelope = calculateEnvelope(t, { duration, attack, decay, sustain, release });
    let sample = rawSample * envelope;

    // 4. Overdrive / Soft Clipping Distortion
    if (distortion > 0) {
      const drive = 1.0 + distortion * 5.0;
      sample = Math.tanh(sample * drive) / Math.tanh(drive);
    }

    // 5. Low-Pass Filter
    if (filterCutoff < 18000) {
      filterPrev = filterPrev + filterAlpha * (sample - filterPrev);
      sample = filterPrev;
    }

    // 6. Bit-Crushing (Retro Quantization)
    if (bitCrush < 16) {
      const steps = Math.pow(2, bitCrush);
      sample = Math.round(sample * steps) / steps;
    }

    // 7. Reverb / Comb Delay
    if (reverb > 0) {
      const delayed = delayBuffer[delayIndex];
      delayBuffer[delayIndex] = sample + delayed * reverb;
      delayIndex = (delayIndex + 1) % delaySamples;
      sample = sample * (1.0 - reverb * 0.4) + delayed * reverb * 0.6;
    }

    samples[i] = sample;
  }

  return {
    samples,
    numSamples,
    duration,
    waveform,
    params,
  };
}

/**
 * Generate a procedural game SFX from mathematical parameter sets.
 */
function synthesizeMathSfx(params = {}) {
  const raw = generateRawSamples(params);
  const numSamples = raw.numSamples;
  const samples = raw.samples;

  // Normalize to prevent harsh clipping
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.98) {
    const gain = 0.95 / peak;
    for (let i = 0; i < numSamples; i++) {
      samples[i] *= gain;
    }
  }

  const wavBuffer = encodeWav(samples, SAMPLE_RATE);
  const base64Audio = wavBuffer.toString('base64');
  const dataUri = `data:audio/wav;base64,${base64Audio}`;

  return {
    dataUri,
    duration: raw.duration,
    sampleCount: numSamples,
    byteSize: wavBuffer.length,
    waveform: raw.waveform,
    params,
  };
}

/**
 * Combine multiple mathematical SFX layers into a single composite game sound.
 * Supports parallel polyphonic mixing, sequential time delays, and master DSP processing.
 */
function synthesizeLayeredSfx({
  soundName = 'Layered SFX Composition',
  layers = [],
  masterReverb = 0,
  masterDistortion = 0,
  masterFilter = 20000,
} = {}) {
  const validLayers = Array.isArray(layers) && layers.length > 0 ? layers : [{}];

  // 1. Render each layer and find total composition duration
  const renderedLayers = [];
  let maxEndTime = 0.1;

  for (let idx = 0; idx < validLayers.length; idx++) {
    const l = validLayers[idx] || {};
    const layerParams = l.params || l;
    const delay = Math.max(0, Number(l.delay || 0));
    const volume = Math.max(0, Math.min(2.0, Number(l.volume ?? 1.0)));
    const layerName = l.name || layerParams.soundName || `Layer ${idx + 1}`;

    const raw = generateRawSamples(layerParams);
    const layerEnd = delay + raw.duration;
    if (layerEnd > maxEndTime) {
      maxEndTime = layerEnd;
    }

    // Render individual layer dataUri so each can be soloed or previewed
    const layerNormalized = new Float32Array(raw.samples);
    let layerPeak = 0;
    for (let i = 0; i < raw.numSamples; i++) {
      const abs = Math.abs(layerNormalized[i]);
      if (abs > layerPeak) layerPeak = abs;
    }
    if (layerPeak > 0.98) {
      const g = 0.95 / layerPeak;
      for (let i = 0; i < raw.numSamples; i++) {
        layerNormalized[i] *= g;
      }
    }
    const layerBuffer = encodeWav(layerNormalized, SAMPLE_RATE);
    const layerDataUri = `data:audio/wav;base64,${layerBuffer.toString('base64')}`;

    renderedLayers.push({
      id: l.id || `layer-${idx + 1}-${Date.now().toString(36)}`,
      name: layerName,
      delay,
      volume,
      waveform: raw.waveform,
      frequency: layerParams.frequency || 440,
      duration: raw.duration,
      samples: raw.samples,
      numSamples: raw.numSamples,
      dataUri: layerDataUri,
      params: layerParams,
    });
  }

  // 2. Allocate Master Composite Sample Buffer
  const totalDuration = Math.min(Math.max(maxEndTime, 0.1), 6.0);
  const totalSamples = Math.floor(SAMPLE_RATE * totalDuration);
  const masterSamples = new Float32Array(totalSamples);

  // 3. Mix all layers with their individual volume and delay offsets
  for (const layer of renderedLayers) {
    const startIdx = Math.floor(layer.delay * SAMPLE_RATE);
    const vol = layer.volume;
    for (let i = 0; i < layer.numSamples && startIdx + i < totalSamples; i++) {
      masterSamples[startIdx + i] += layer.samples[i] * vol;
    }
  }

  // 4–7. Shared Master Effects & Peak Limiter
  applyMasterProcessing(masterSamples, {
    masterFilter,
    masterDistortion,
    masterReverb,
  });

  const masterWav = encodeWav(masterSamples, SAMPLE_RATE);
  const masterDataUri = `data:audio/wav;base64,${masterWav.toString('base64')}`;

  return {
    ok: true,
    soundName,
    isLayered: true,
    duration: totalDuration,
    dataUri: masterDataUri,
    byteSize: masterWav.length,
    layerCount: renderedLayers.length,
    layers: renderedLayers.map((l) => ({
      id: l.id,
      name: l.name,
      delay: l.delay,
      volume: l.volume,
      waveform: l.waveform,
      frequency: l.frequency,
      duration: l.duration,
      dataUri: l.dataUri,
      params: l.params,
    })),
    masterEffects: {
      masterReverb,
      masterDistortion,
      masterFilter,
    },
  };
}

/**
 * Apply shared master filter, overdrive distortion, comb reverb, and soft peak limiting in-place.
 */
function applyMasterProcessing(
  samples,
  { masterFilter = 20000, masterDistortion = 0, masterReverb = 0 } = {}
) {
  const totalSamples = samples.length;

  if (masterFilter < 18000) {
    const rc = 1.0 / (2 * Math.PI * Math.max(masterFilter, 50));
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);
    let prev = 0;
    for (let i = 0; i < totalSamples; i++) {
      prev = prev + alpha * (samples[i] - prev);
      samples[i] = prev;
    }
  }

  if (masterDistortion > 0) {
    const drive = 1.0 + Math.min(masterDistortion, 1.0) * 4.0;
    for (let i = 0; i < totalSamples; i++) {
      samples[i] = Math.tanh(samples[i] * drive) / Math.tanh(drive);
    }
  }

  if (masterReverb > 0) {
    const reverbVal = Math.min(masterReverb, 0.8);
    const delaySamples = Math.floor(SAMPLE_RATE * 0.045);
    const delayBuffer = new Float32Array(delaySamples);
    let delayIdx = 0;
    for (let i = 0; i < totalSamples; i++) {
      const s = samples[i];
      const delayed = delayBuffer[delayIdx];
      delayBuffer[delayIdx] = s + delayed * reverbVal;
      delayIdx = (delayIdx + 1) % delaySamples;
      samples[i] = s * (1.0 - reverbVal * 0.4) + delayed * reverbVal * 0.6;
    }
  }

  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.95) {
    const gain = 0.92 / peak;
    for (let i = 0; i < totalSamples; i++) {
      samples[i] *= gain;
    }
  }
}

const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Convert a musical note string (e.g. "C4", "Eb5", "F#3") or numeric Hz to frequency in Hz.
 * Returns null for rests ("-", ".", "", "rest").
 */
function noteToFrequency(token) {
  if (token === null || token === undefined) return null;
  if (typeof token === 'number') {
    return Number.isFinite(token) && token >= 20 ? token : null;
  }
  const str = String(token).trim();
  if (!str || str === '-' || str === '.' || str === '~' || str.toLowerCase() === 'rest') {
    return null;
  }
  const numeric = Number(str);
  if (Number.isFinite(numeric) && numeric >= 20) {
    return numeric;
  }
  const match = str.match(/^([A-Ga-g])([#b]?)(-?\d)$/);
  if (!match) return null;

  const base = NOTE_SEMITONES[match[1].toUpperCase()];
  if (base === undefined) return null;

  let semitone = base;
  if (match[2] === '#') semitone += 1;
  if (match[2] === 'b') semitone -= 1;

  const octave = parseInt(match[3], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Build synth parameters for a percussion hit token ("K", "S", "H") or drum channel instrument.
 */
function buildDrumHitParams(token, instrument, stepDuration) {
  const upper = String(token || '').trim().toUpperCase();
  const kind =
    upper === 'K' || instrument === 'kick'
      ? 'kick'
      : upper === 'S' || instrument === 'snare'
        ? 'snare'
        : upper === 'H' || instrument === 'hihat'
          ? 'hihat'
          : null;

  if (!kind) return null;

  if (kind === 'kick') {
    return {
      waveform: 'sine',
      frequency: 155,
      freqSlide: -950,
      duration: Math.min(Math.max(stepDuration * 1.2, 0.1), 0.18),
      attack: 0.002,
      decay: 0.08,
      sustain: 0.05,
      release: 0.05,
      distortion: 0.25,
      filterCutoff: 900,
    };
  }
  if (kind === 'snare') {
    return {
      waveform: 'noise',
      frequency: 240,
      freqSlide: -300,
      duration: Math.min(Math.max(stepDuration * 1.1, 0.09), 0.16),
      attack: 0.002,
      decay: 0.07,
      sustain: 0.06,
      release: 0.05,
      distortion: 0.3,
      filterCutoff: 5800,
      bitCrush: 10,
    };
  }
  return {
    waveform: 'noise',
    frequency: 6000,
    freqSlide: 0,
    duration: 0.055,
    attack: 0.001,
    decay: 0.025,
    sustain: 0.01,
    release: 0.02,
    filterCutoff: 14000,
    bitCrush: 10,
  };
}

/**
 * Mix a generated sample buffer into masterSamples at a specific sample offset.
 */
function mixBufferAt(masterSamples, sourceSamples, startIdx, gain) {
  const limit = Math.min(sourceSamples.length, masterSamples.length - startIdx);
  for (let i = 0; i < limit; i++) {
    masterSamples[startIdx + i] += sourceSamples[i] * gain;
  }
}

/**
 * Compose and render a seamless multi-channel game BGM loop from musical step patterns.
 */
function composeBgmLoop({
  songName = '8-Bit Adventure Loop',
  bpm = 128,
  key = 'C Major',
  stepCount = 32,
  loops = 2,
  channels = [],
  masterReverb = 0.2,
  masterDistortion = 0.05,
  masterFilter = 16000,
} = {}) {
  const safeBpm = Math.min(Math.max(Number(bpm) || 128, 60), 210);
  const safeStepCount = Math.min(Math.max(Math.round(Number(stepCount) || 32), 8), 64);
  const stepSec = 60 / safeBpm / 4; // 16th note duration

  // Clamp total loops so total duration stays <= 24s for crisp browser streaming
  const maxLoops = Math.max(1, Math.floor(24 / Math.max(safeStepCount * stepSec, 0.5)));
  const safeLoops = Math.min(Math.max(Math.round(Number(loops) || 2), 1), Math.min(4, maxLoops));

  const patternDuration = safeStepCount * stepSec;
  const totalDuration = patternDuration * safeLoops;
  const totalSamples = Math.floor(SAMPLE_RATE * totalDuration);
  const masterSamples = new Float32Array(totalSamples);

  const validChannels = Array.isArray(channels) && channels.length > 0 ? channels : [];
  const normalizedChannels = validChannels.map((ch, chIdx) => {
    const instrument = ch.instrument || ch.waveform || 'square';
    const volume = Math.max(0, Math.min(1.5, Number(ch.volume ?? 0.85)));
    const muted = Boolean(ch.muted);
    const steps = Array.from({ length: safeStepCount }, (_, i) => {
      const raw = Array.isArray(ch.steps) ? ch.steps[i] : '-';
      return raw === null || raw === undefined || raw === '' ? '-' : String(raw).trim();
    });

    if (!muted) {
      for (let loopIdx = 0; loopIdx < safeLoops; loopIdx++) {
        const loopOffsetSec = loopIdx * patternDuration;

        for (let sIdx = 0; sIdx < safeStepCount; sIdx++) {
          const token = steps[sIdx];
          if (!token || token === '-' || token === '.' || token === '~' || token.toLowerCase() === 'rest') {
            continue;
          }

          // Count trailing "~" sustain tokens to determine note length
          let span = 1;
          while (sIdx + span < safeStepCount && steps[sIdx + span] === '~') {
            span++;
          }

          const startIdx = Math.floor((loopOffsetSec + sIdx * stepSec) * SAMPLE_RATE);
          if (startIdx >= totalSamples) continue;

          const drumParams = buildDrumHitParams(token, instrument, stepSec);
          if (drumParams) {
            const raw = generateRawSamples(drumParams);
            mixBufferAt(masterSamples, raw.samples, startIdx, volume * 0.75);
            continue;
          }

          // Drum channel generic trigger ("X", "1", "HIT")
          if (instrument === 'kick' || instrument === 'snare' || instrument === 'hihat') {
            const hit = buildDrumHitParams(instrument === 'kick' ? 'K' : instrument === 'snare' ? 'S' : 'H', instrument, stepSec);
            if (hit) {
              const raw = generateRawSamples(hit);
              mixBufferAt(masterSamples, raw.samples, startIdx, volume * 0.75);
            }
            continue;
          }

          const freq = noteToFrequency(token);
          if (!freq) continue;

          const noteDuration = Math.min(span * stepSec * 0.96, 2.0);
          const synthWaveform = ['sine', 'square', 'sawtooth', 'triangle', 'noise', 'fm'].includes(instrument)
            ? instrument
            : 'square';

          const attack = Math.min(Number(ch.attack ?? 0.008), noteDuration * 0.25);
          const release = Math.min(Number(ch.release ?? 0.04), noteDuration * 0.4);
          const decay = Math.min(Number(ch.decay ?? 0.06), Math.max(0.01, noteDuration - attack - release));

          const raw = generateRawSamples({
            waveform: synthWaveform,
            frequency: freq,
            freqSlide: Number(ch.freqSlide || 0),
            duration: Math.max(noteDuration, 0.04),
            attack,
            decay,
            sustain: ch.sustain ?? (synthWaveform === 'triangle' ? 0.45 : 0.65),
            release,
            dutyCycle: ch.dutyCycle ?? 0.5,
            distortion: Number(ch.distortion || 0),
            filterCutoff: Number(ch.filterCutoff || (synthWaveform === 'sawtooth' ? 3500 : 12000)),
            bitCrush: ch.bitCrush || 16,
            modFrequency: ch.modFrequency || 40,
            modDepth: ch.modDepth || 1.5,
          });

          mixBufferAt(masterSamples, raw.samples, startIdx, volume * 0.45);
        }
      }
    }

    return {
      id: ch.id || `ch-${chIdx + 1}-${Date.now().toString(36)}`,
      name: ch.name || `Track ${chIdx + 1}`,
      instrument,
      volume,
      muted,
      filterCutoff: Number(ch.filterCutoff || 12000),
      distortion: Number(ch.distortion || 0),
      steps,
    };
  });

  applyMasterProcessing(masterSamples, {
    masterFilter,
    masterDistortion,
    masterReverb,
  });

  const wavBuffer = encodeWav(masterSamples, SAMPLE_RATE);
  const dataUri = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

  return {
    ok: true,
    isBgm: true,
    soundName: songName,
    bpm: safeBpm,
    key,
    stepCount: safeStepCount,
    loops: safeLoops,
    duration: totalDuration,
    dataUri,
    byteSize: wavBuffer.length,
    channels: normalizedChannels,
    masterEffects: {
      masterReverb,
      masterDistortion,
      masterFilter,
    },
  };
}

/**
 * Encode dual Float32Array stereo channels into a valid 2-channel 16-bit RIFF WAVE Buffer.
 */
function encodeStereoWav(leftSamples, rightSamples, sampleRate = SAMPLE_RATE) {
  const numFrames = Math.min(leftSamples.length, rightSamples.length);
  const numChannels = 2;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numFrames * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, leftSamples[i]));
    const r = Math.max(-1, Math.min(1, rightSamples[i]));
    const offset = 44 + i * 4;
    buffer.writeInt16LE(Math.floor(l < 0 ? l * 32768 : l * 32767), offset);
    buffer.writeInt16LE(Math.floor(r < 0 ? r * 32768 : r * 32767), offset + 2);
  }

  return buffer;
}

const CHORD_INTERVALS = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '5': [0, 7, 12],
};

/**
 * Parse a step token into one or more frequencies in Hz.
 * Supports single notes ("C4", "Eb5"), stacked polyphonic notes ("C4+E4+G4", "C4/E4/G4"),
 * and chord symbols ("Am", "Am7", "Fmaj7", "G7", "C3m").
 */
function parseStepFrequencies(token) {
  if (token === null || token === undefined) return [];
  const str = String(token).trim();
  if (!str || str === '-' || str === '.' || str === '~' || str.toLowerCase() === 'rest') {
    return [];
  }

  // Explicit stacked notes e.g. "C4+E4+G4" or "A3/C4/E4"
  if (str.includes('+') || str.includes('/')) {
    return str
      .split(/[+/]/)
      .map((part) => noteToFrequency(part.trim()))
      .filter((f) => f !== null);
  }

  // Single exact note or numeric Hz
  const singleFreq = noteToFrequency(str);
  if (singleFreq !== null) return [singleFreq];

  // Named chord symbol e.g. "Am", "F#m7", "Cmaj7", "G7", "Bb", "D3m"
  const chordMatch = str.match(/^([A-Ga-g])([#b]?)(-?\d)?(maj7|maj|min|m7|sus2|sus4|dim|aug|7|5|m)?$/i);
  if (!chordMatch) return [];

  const rootBase = NOTE_SEMITONES[chordMatch[1].toUpperCase()];
  if (rootBase === undefined) return [];

  let semitone = rootBase;
  if (chordMatch[2] === '#') semitone += 1;
  if (chordMatch[2] === 'b') semitone -= 1;

  const octave = chordMatch[3] !== undefined ? parseInt(chordMatch[3], 10) : 3;
  const quality = (chordMatch[4] || '').toLowerCase();
  const intervals = CHORD_INTERVALS[quality];
  if (!intervals) return [];

  const rootMidi = (octave + 1) * 12 + semitone;
  return intervals.map((offset) => 440 * Math.pow(2, (rootMidi + offset - 69) / 12));
}

/**
 * Karplus-Strong physical-modeling plucked string (acoustic guitar or harp).
 */
function synthesizePluckedString(freq, totalDur, { damping = 0.9945, brightness = 0.7 } = {}) {
  const numSamples = Math.floor(SAMPLE_RATE * totalDur);
  const samples = new Float32Array(numSamples);

  const exactPeriod = SAMPLE_RATE / Math.max(freq, 40);
  const periodInt = Math.max(2, Math.floor(exactPeriod));
  const frac = exactPeriod - periodInt;

  const ring = new Float32Array(periodInt + 1);
  // Warm filtered pluck impulse (combines soft burst + fundamental bias)
  let lpPrev = 0;
  for (let i = 0; i < periodInt; i++) {
    const noise = Math.random() * 2 - 1;
    const smooth = lpPrev + brightness * (noise - lpPrev);
    lpPrev = smooth;
    ring[i] = smooth * 0.8 + Math.sin((2 * Math.PI * i) / periodInt) * 0.25;
  }

  let idx = 0;
  for (let i = 0; i < numSamples; i++) {
    const nextIdx = (idx + 1) % periodInt;
    const prevIdx = (idx - 1 + periodInt) % periodInt;
    // Fractional delay interpolation + 2-point averaging filter
    const current = ring[idx] * (1 - frac) + ring[nextIdx] * frac;
    const next = ring[nextIdx] * (1 - frac) + ring[prevIdx] * frac;
    const filtered = damping * 0.5 * (current + next);

    samples[i] = current;
    ring[idx] = filtered;
    idx = nextIdx;
  }

  // Gentle fade-in (2ms) and smooth release at end
  const fadeIn = Math.min(Math.floor(SAMPLE_RATE * 0.002), numSamples);
  const fadeOut = Math.min(Math.floor(SAMPLE_RATE * 0.08), numSamples);
  for (let i = 0; i < fadeIn; i++) samples[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) {
    samples[numSamples - 1 - i] *= i / fadeOut;
  }

  return samples;
}

/**
 * Physical-modeling additive + harmonic generator for realistic acoustic instruments.
 * Supports: piano, epiano, guitar, harp, strings, flute, brass, acoustic_bass,
 * and acoustic percussion (acoustic_kick, acoustic_snare, acoustic_hihat).
 */
function generateAcousticNoteSamples(instrument, freq, duration, velocity = 0.85) {
  const inst = String(instrument || 'piano').toLowerCase();

  // Acoustic percussion hits
  if (inst === 'acoustic_kick' || inst === 'kick') {
    const dur = 0.28;
    const n = Math.floor(SAMPLE_RATE * dur);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const f = 44 + 115 * Math.exp(-t * 32);
      phase += (2 * Math.PI * f) / SAMPLE_RATE;
      const body = Math.sin(phase) * Math.exp(-t * 9.5);
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 240) * 0.35;
      out[i] = Math.tanh((body + click) * 1.4) * velocity;
    }
    return out;
  }

  if (inst === 'acoustic_snare' || inst === 'snare') {
    const dur = 0.24;
    const n = Math.floor(SAMPLE_RATE * dur);
    const out = new Float32Array(n);
    let phase = 0;
    let hpPrev = 0;
    let lastNoise = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const f = 135 + 65 * Math.exp(-t * 35);
      phase += (2 * Math.PI * f) / SAMPLE_RATE;
      const shell = Math.sin(phase) * Math.exp(-t * 18) * 0.6;
      const rawNoise = Math.random() * 2 - 1;
      hpPrev = 0.85 * (hpPrev + rawNoise - lastNoise);
      lastNoise = rawNoise;
      const wires = hpPrev * Math.exp(-t * 14) * 0.8;
      out[i] = (shell + wires) * velocity;
    }
    return out;
  }

  if (inst === 'acoustic_hihat' || inst === 'hihat') {
    const dur = 0.09;
    const n = Math.floor(SAMPLE_RATE * dur);
    const out = new Float32Array(n);
    const ratios = [1, 1.34, 1.68, 2.13, 2.71, 3.38];
    const base = 330;
    let hpPrev = 0;
    let lastIn = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      let metal = 0;
      for (const r of ratios) {
        metal += Math.sin(2 * Math.PI * base * r * t) > 0 ? 0.14 : -0.14;
      }
      const mix = metal * 0.55 + (Math.random() * 2 - 1) * 0.45;
      hpPrev = 0.9 * (hpPrev + mix - lastIn);
      lastIn = mix;
      out[i] = hpPrev * Math.exp(-t * 42) * velocity * 0.8;
    }
    return out;
  }

  if (inst === 'guitar') {
    return synthesizePluckedString(freq, Math.min(duration + 0.35, 3.0), {
      damping: 0.9942,
      brightness: 0.62,
    });
  }

  if (inst === 'harp') {
    return synthesizePluckedString(freq, Math.min(duration + 0.55, 3.5), {
      damping: 0.9968,
      brightness: 0.78,
    });
  }

  // Additive + Physical Harmonics instruments with natural release tails
  const tail = inst === 'piano' || inst === 'epiano' ? 0.35 : inst === 'strings' ? 0.28 : 0.14;
  const totalDur = Math.min(duration + tail, 3.8);
  const n = Math.floor(SAMPLE_RATE * totalDur);
  const out = new Float32Array(n);

  if (inst === 'piano') {
    // Steel-string inharmonicity + frequency-dependent harmonic damping + hammer thump
    const B = 0.00018;
    const partials = 8;
    const freqs = [];
    const amps = [];
    for (let k = 1; k <= partials; k++) {
      freqs.push(k * freq * Math.sqrt(1 + B * k * k));
      amps.push(1.0 / Math.pow(k, 1.35));
    }
    let hammerPhase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env =
        t < 0.005
          ? t / 0.005
          : t <= duration
            ? Math.exp(-(t - 0.005) * 1.4)
            : Math.exp(-(duration - 0.005) * 1.4) * Math.exp(-(t - duration) * 9.0);
      let s = 0;
      for (let k = 0; k < partials; k++) {
        if (freqs[k] < 16000) {
          const partialDecay = Math.exp(-t * (k * 1.35));
          s += amps[k] * partialDecay * Math.sin(2 * Math.PI * freqs[k] * t);
        }
      }
      hammerPhase += (2 * Math.PI * (freq * 1.5)) / SAMPLE_RATE;
      const hammer = Math.sin(hammerPhase) * Math.exp(-t * 260) * 0.18;
      out[i] = (s * 0.55 + hammer) * env * velocity;
    }
    return out;
  }

  if (inst === 'epiano') {
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const env =
        t < 0.004
          ? t / 0.004
          : t <= duration
            ? Math.exp(-(t - 0.004) * 1.8)
            : Math.exp(-(duration - 0.004) * 1.8) * Math.exp(-(t - duration) * 8.0);
      const tineBell = Math.sin(2 * Math.PI * freq * 7 * t) * Math.exp(-t * 22) * 0.28;
      const body =
        Math.sin(2 * Math.PI * freq * t) * 0.72 +
        Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 4.5) * 0.22;
      out[i] = (body + tineBell) * env * velocity;
    }
    return out;
  }

  if (inst === 'strings') {
    // 3-voice detuned bowed ensemble with slow swell, vibrato, and resonant wooden body filter
    const attack = Math.min(0.16, duration * 0.38);
    const detunes = [0.9962, 1.0, 1.0038];
    let lp = 0;
    const rc = 1.0 / (2 * Math.PI * 2400);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);
    const phases = [0, 0.7, 1.9];

    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const vibAmount = Math.min(1, t / Math.max(attack, 0.05)) * 0.0045;
      const vib = 1 + Math.sin(2 * Math.PI * 5.4 * t) * vibAmount;

      let bowSum = 0;
      for (let v = 0; v < 3; v++) {
        const f = freq * detunes[v] * vib;
        phases[v] += (2 * Math.PI * f) / SAMPLE_RATE;
        // Softened multi-harmonic bow waveform
        bowSum +=
          Math.sin(phases[v]) * 0.55 +
          Math.sin(phases[v] * 2) * 0.28 +
          Math.sin(phases[v] * 3) * 0.16 +
          Math.sin(phases[v] * 4) * 0.09 +
          Math.sin(phases[v] * 5) * 0.05;
      }
      bowSum *= 0.28;
      lp = lp + alpha * (bowSum - lp);

      let env = 1.0;
      if (t < attack) env = Math.sin((t / attack) * (Math.PI / 2));
      else if (t > duration) env = Math.max(0, Math.exp(-(t - duration) * 7.5));

      out[i] = lp * env * velocity;
    }
    return out;
  }

  if (inst === 'flute') {
    const attack = Math.min(0.065, duration * 0.25);
    let phase = 0;
    let bpPrev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const vibScale = Math.max(0, Math.min(1, (t - 0.08) / 0.15));
      const f = freq * (1 + Math.sin(2 * Math.PI * 5.2 * t) * 0.006 * vibScale);
      phase += (2 * Math.PI * f) / SAMPLE_RATE;

      const airTone =
        Math.sin(phase) * 0.78 +
        Math.sin(phase * 2) * 0.18 +
        Math.sin(phase * 3) * 0.05;
      const rawBreath = (Math.random() * 2 - 1) * Math.exp(-t * 38) * 0.22;
      bpPrev = bpPrev + 0.25 * (rawBreath - bpPrev);

      let env = 1.0;
      if (t < attack) env = t / attack;
      else if (t > duration) env = Math.max(0, Math.exp(-(t - duration) * 12.0));

      out[i] = (airTone + bpPrev) * env * velocity * 0.85;
    }
    return out;
  }

  if (inst === 'brass') {
    // Dynamic filter bloom: low-pass opens smoothly as pressure builds
    const attack = Math.min(0.075, duration * 0.3);
    let phase = 0;
    let lp = 0;
    const dt = 1.0 / SAMPLE_RATE;

    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const bloom = t < attack ? t / attack : 1.0;
      phase += (2 * Math.PI * freq) / SAMPLE_RATE;

      let raw = 0;
      for (let k = 1; k <= 7; k++) {
        if (freq * k < 15000) {
          raw += Math.sin(phase * k) / Math.pow(k, 0.85);
        }
      }
      raw *= 0.38;

      const cutoff = 480 + bloom * 3800 * (t > duration ? 0.4 : 1.0);
      const rc = 1.0 / (2 * Math.PI * cutoff);
      const alpha = dt / (rc + dt);
      lp = lp + alpha * (raw - lp);

      let env = 1.0;
      if (t < attack) env = Math.sin((t / attack) * (Math.PI / 2));
      else if (t > duration) env = Math.max(0, Math.exp(-(t - duration) * 11.0));

      out[i] = lp * env * velocity;
    }
    return out;
  }

  // Fallback warm acoustic bass / plucked sine
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env =
      t < 0.008
        ? t / 0.008
        : t <= duration
          ? Math.exp(-(t - 0.008) * 2.2)
          : Math.exp(-(duration - 0.008) * 2.2) * Math.exp(-(t - duration) * 10.0);
    const s = Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 * Math.exp(-t * 8);
    out[i] = s * env * velocity;
  }
  return out;
}

/**
 * Mix a mono instrument sample buffer into Stereo Left/Right buffers with constant-power panning.
 */
function mixStereoAt(leftBus, rightBus, monoSamples, startIdx, gain, pan = 0) {
  const clampedPan = Math.max(-1, Math.min(1, pan));
  const angle = ((clampedPan + 1) * Math.PI) / 4; // 0 .. PI/2
  const gainL = Math.cos(angle) * gain;
  const gainR = Math.sin(angle) * gain;
  const limit = Math.min(monoSamples.length, leftBus.length - startIdx);
  for (let i = 0; i < limit; i++) {
    const s = monoSamples[i];
    leftBus[startIdx + i] += s * gainL;
    rightBus[startIdx + i] += s * gainR;
  }
}

/**
 * Multi-tap Stereo Concert Hall Reverb + Subtle Tape Warmth + Peak Limiter.
 */
function applyAcousticHallMaster(leftBus, rightBus, { hallReverb = 0.35, warmth = 0.2 } = {}) {
  const len = leftBus.length;

  // 1. Optional gentle harmonic analog warmth + soft high rolloff
  if (warmth > 0) {
    const drive = 1.0 + Math.min(warmth, 1.0) * 1.4;
    const norm = Math.tanh(drive);
    for (let i = 0; i < len; i++) {
      leftBus[i] = Math.tanh(leftBus[i] * drive) / norm;
      rightBus[i] = Math.tanh(rightBus[i] * drive) / norm;
    }
  }

  // 2. Parallel Stereo Comb Hall Reverb
  const wet = Math.min(Math.max(hallReverb, 0), 0.75);
  if (wet > 0.01) {
    const combLengthsL = [1277, 1553, 1867, 2111];
    const combLengthsR = [1319, 1601, 1913, 2161];
    const feedbacks = [0.76, 0.74, 0.72, 0.7];

    const combsL = combLengthsL.map((sz) => ({ buf: new Float32Array(sz), idx: 0, lp: 0 }));
    const combsR = combLengthsR.map((sz) => ({ buf: new Float32Array(sz), idx: 0, lp: 0 }));

    for (let i = 0; i < len; i++) {
      const inL = leftBus[i];
      const inR = rightBus[i];
      let revL = 0;
      let revR = 0;

      for (let c = 0; c < 4; c++) {
        const cl = combsL[c];
        const delayedL = cl.buf[cl.idx];
        cl.lp = cl.lp + 0.45 * (delayedL - cl.lp);
        cl.buf[cl.idx] = inL + cl.lp * feedbacks[c];
        cl.idx = (cl.idx + 1) % cl.buf.length;
        revL += delayedL;

        const cr = combsR[c];
        const delayedR = cr.buf[cr.idx];
        cr.lp = cr.lp + 0.45 * (delayedR - cr.lp);
        cr.buf[cr.idx] = inR + cr.lp * feedbacks[c];
        cr.idx = (cr.idx + 1) % cr.buf.length;
        revR += delayedR;
      }

      leftBus[i] = inL * (1 - wet * 0.35) + (revL * 0.25) * wet;
      rightBus[i] = inR * (1 - wet * 0.35) + (revR * 0.25) * wet;
    }
  }

  // 3. Stereo Peak Normalization
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const aL = Math.abs(leftBus[i]);
    const aR = Math.abs(rightBus[i]);
    if (aL > peak) peak = aL;
    if (aR > peak) peak = aR;
  }
  if (peak > 0.94) {
    const g = 0.91 / peak;
    for (let i = 0; i < len; i++) {
      leftBus[i] *= g;
      rightBus[i] *= g;
    }
  }
}

/**
 * Compose full-featured Stereo Acoustic Music using physical-modeling instruments,
 * polyphonic chords, stereo panning, hall acoustics, and multi-section song structures.
 */
function composeAcousticMusic({
  songName = 'Moonlit Acoustic Piece',
  bpm = 96,
  key = 'A Minor',
  stepCount = 32,
  loops = 2,
  channels = [],
  sections = null,
  hallReverb = 0.38,
  warmth = 0.2,
} = {}) {
  const safeBpm = Math.min(Math.max(Number(bpm) || 96, 55), 190);
  const stepSec = 60 / safeBpm / 4; // 16th-note grid

  // Build section schedule: supports multi-section arrangements or single repeated pattern
  const sectionList =
    Array.isArray(sections) && sections.length > 0
      ? sections
      : [
          {
            name: 'Main Theme',
            stepCount,
            loops,
            channels,
          },
        ];

  let totalDuration = 0;
  const scheduledSections = sectionList.map((sec, secIdx) => {
    const secSteps = Math.min(Math.max(Math.round(Number(sec.stepCount || stepCount) || 32), 8), 64);
    const secLoops = Math.min(Math.max(Math.round(Number(sec.loops || loops) || 1), 1), 4);
    const patDur = secSteps * stepSec;
    const secDur = patDur * secLoops;
    const startOffset = totalDuration;
    totalDuration += secDur;
    return {
      name: sec.name || `Section ${secIdx + 1}`,
      stepCount: secSteps,
      loops: secLoops,
      patDur,
      startOffset,
      channels: Array.isArray(sec.channels) ? sec.channels : channels,
    };
  });

  // Cap total render duration at 36s for responsive WAV transfer
  totalDuration = Math.min(Math.max(totalDuration + 0.8, 1.0), 36.0); // +0.8s hall reverb tail
  const totalSamples = Math.floor(SAMPLE_RATE * totalDuration);
  const leftBus = new Float32Array(totalSamples);
  const rightBus = new Float32Array(totalSamples);

  for (const sec of scheduledSections) {
    for (let chIdx = 0; chIdx < sec.channels.length; chIdx++) {
      const ch = sec.channels[chIdx] || {};
      if (ch.muted) continue;

      const inst = String(ch.instrument || 'piano').toLowerCase();
      const volume = Math.max(0, Math.min(1.5, Number(ch.volume ?? 0.85)));
      const pan = Math.max(-1, Math.min(1, Number(ch.pan ?? 0)));
      const steps = Array.from({ length: sec.stepCount }, (_, i) => {
        const raw = Array.isArray(ch.steps) ? ch.steps[i] : '-';
        return raw === null || raw === undefined || raw === '' ? '-' : String(raw).trim();
      });

      for (let loopIdx = 0; loopIdx < sec.loops; loopIdx++) {
        const loopBase = sec.startOffset + loopIdx * sec.patDur;

        for (let sIdx = 0; sIdx < sec.stepCount; sIdx++) {
          const token = steps[sIdx];
          if (!token || token === '-' || token === '.' || token === '~' || token.toLowerCase() === 'rest') {
            continue;
          }

          let span = 1;
          while (sIdx + span < sec.stepCount && steps[sIdx + span] === '~') {
            span++;
          }

          const startIdx = Math.floor((loopBase + sIdx * stepSec) * SAMPLE_RATE);
          if (startIdx >= totalSamples) continue;

          // Percussion tokens or drum channels
          const upper = token.toUpperCase();
          if (
            upper === 'K' ||
            upper === 'S' ||
            upper === 'H' ||
            inst.includes('kick') ||
            inst.includes('snare') ||
            inst.includes('hihat')
          ) {
            const drumKind =
              upper === 'K' || inst.includes('kick')
                ? 'acoustic_kick'
                : upper === 'S' || inst.includes('snare')
                  ? 'acoustic_snare'
                  : 'acoustic_hihat';
            const hit = generateAcousticNoteSamples(drumKind, 100, 0.25, 0.9);
            mixStereoAt(leftBus, rightBus, hit, startIdx, volume * 0.72, pan);
            continue;
          }

          const freqs = parseStepFrequencies(token);
          if (freqs.length === 0) continue;

          const noteDur = Math.min(span * stepSec * 0.98, 3.0);
          // Scale polyphonic chord notes cleanly so 4-note chords balance against single lead lines
          const chordGain = freqs.length > 1 ? 0.55 / Math.sqrt(freqs.length) : 0.55;

          for (let fIdx = 0; fIdx < freqs.length; fIdx++) {
            const voicePan = freqs.length > 1 ? pan + (fIdx - (freqs.length - 1) / 2) * 0.12 : pan;
            const noteBuf = generateAcousticNoteSamples(inst, freqs[fIdx], noteDur, 0.9);
            mixStereoAt(leftBus, rightBus, noteBuf, startIdx, volume * chordGain, voicePan);
          }
        }
      }
    }
  }

  applyAcousticHallMaster(leftBus, rightBus, { hallReverb, warmth });

  const wavBuffer = encodeStereoWav(leftBus, rightBus, SAMPLE_RATE);
  const dataUri = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

  // Normalize primary pattern channels for frontend sequencer editor display
  const primarySec = scheduledSections[0];
  const normalizedChannels = (primarySec?.channels || []).map((ch, idx) => ({
    id: ch.id || `ac-ch-${idx + 1}-${Date.now().toString(36)}`,
    name: ch.name || `Instrument ${idx + 1}`,
    instrument: String(ch.instrument || 'piano').toLowerCase(),
    volume: Math.max(0, Math.min(1.5, Number(ch.volume ?? 0.85))),
    pan: Math.max(-1, Math.min(1, Number(ch.pan ?? 0))),
    muted: Boolean(ch.muted),
    steps: Array.from({ length: primarySec.stepCount }, (_, i) => {
      const raw = Array.isArray(ch.steps) ? ch.steps[i] : '-';
      return raw === null || raw === undefined || raw === '' ? '-' : String(raw).trim();
    }),
  }));

  return {
    ok: true,
    isAcousticMusic: true,
    stereo: true,
    soundName: songName,
    bpm: safeBpm,
    key,
    stepCount: primarySec?.stepCount || stepCount,
    loops: primarySec?.loops || loops,
    sectionCount: scheduledSections.length,
    sections: scheduledSections.map((s) => ({
      name: s.name,
      stepCount: s.stepCount,
      loops: s.loops,
    })),
    duration: totalDuration,
    dataUri,
    byteSize: wavBuffer.length,
    channels: normalizedChannels,
    acousticEffects: {
      hallReverb,
      warmth,
    },
  };
}

module.exports = {
  synthesizeMathSfx,
  synthesizeLayeredSfx,
  composeBgmLoop,
  composeAcousticMusic,
  generateAcousticNoteSamples,
  parseStepFrequencies,
  noteToFrequency,
  generateRawSamples,
  encodeWav,
  encodeStereoWav,
};
