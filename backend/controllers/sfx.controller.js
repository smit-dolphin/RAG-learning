const {
  synthesizeMathSfx,
  synthesizeLayeredSfx,
  composeBgmLoop,
  composeAcousticMusic,
} = require('../utils/mathSfxSynth');
const {
  SFX_PRESETS,
  LAYERED_SFX_PRESETS,
  BGM_PRESETS,
  ACOUSTIC_MUSIC_PRESETS,
  ORCHESTRA_PRESETS,
} = require('../agents/sfxPresetData');

/**
 * POST /sfx/synthesize — Synthesize audio directly from mathematical parameter sets.
 */
function handleSynthesize(req, res) {
  try {
    const params = req.body || {};
    const result = synthesizeMathSfx(params);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('SFX synthesize error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * POST /sfx/layered — Synthesize a multi-layer composite audio composition.
 */
function handleSynthesizeLayered(req, res) {
  try {
    const payload = req.body || {};
    const result = synthesizeLayeredSfx(payload);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('SFX layered synthesize error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * POST /sfx/bgm — Compose and render a multi-channel looping background music track.
 */
function handleComposeBgm(req, res) {
  try {
    const payload = req.body || {};
    const result = composeBgmLoop(payload);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('SFX BGM compose error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * POST /sfx/acoustic — Compose realistic physical-modeling stereo acoustic music.
 */
function handleComposeAcoustic(req, res) {
  try {
    const payload = req.body || {};
    const result = composeAcousticMusic(payload);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('SFX acoustic compose error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * GET /sfx/presets — Return curated mathematical SFX, BGM & Acoustic recipes.
 */
function handleGetPresets(req, res) {
  try {
    res.json({
      ok: true,
      presets: SFX_PRESETS,
      layeredPresets: LAYERED_SFX_PRESETS,
      bgmPresets: BGM_PRESETS,
      acousticPresets: ACOUSTIC_MUSIC_PRESETS,
      orchestraPresets: ORCHESTRA_PRESETS,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  handleSynthesize,
  handleSynthesizeLayered,
  handleComposeBgm,
  handleComposeAcoustic,
  handleGetPresets,
};
