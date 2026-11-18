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

  // 4. Master Low-Pass Filter
  if (masterFilter < 18000) {
    const rc = 1.0 / (2 * Math.PI * Math.max(masterFilter, 50));
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);
    let prev = 0;
    for (let i = 0; i < totalSamples; i++) {
      prev = prev + alpha * (masterSamples[i] - prev);
      masterSamples[i] = prev;
    }
  }

  // 5. Master Soft-Clipping / Warmth Distortion
  if (masterDistortion > 0) {
    const drive = 1.0 + Math.min(masterDistortion, 1.0) * 4.0;
    for (let i = 0; i < totalSamples; i++) {
      masterSamples[i] = Math.tanh(masterSamples[i] * drive) / Math.tanh(drive);
    }
  }

  // 6. Master Reverb / Ambient Tail
  if (masterReverb > 0) {
    const reverbVal = Math.min(masterReverb, 0.8);
    const delaySamples = Math.floor(SAMPLE_RATE * 0.045); // 45ms master delay
    const delayBuffer = new Float32Array(delaySamples);
    let delayIdx = 0;
    for (let i = 0; i < totalSamples; i++) {
      const s = masterSamples[i];
      const delayed = delayBuffer[delayIdx];
      delayBuffer[delayIdx] = s + delayed * reverbVal;
      delayIdx = (delayIdx + 1) % delaySamples;
      masterSamples[i] = s * (1.0 - reverbVal * 0.4) + delayed * reverbVal * 0.6;
    }
  }

  // 7. Master Soft Limiter / Peak Normalization
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(masterSamples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0.95) {
    const gain = 0.92 / peak;
    for (let i = 0; i < totalSamples; i++) {
      masterSamples[i] *= gain;
    }
  }

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

module.exports = {
  synthesizeMathSfx,
  synthesizeLayeredSfx,
  generateRawSamples,
  encodeWav,
};
