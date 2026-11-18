const { synthesizeMathSfx, synthesizeLayeredSfx } = require('../utils/mathSfxSynth');
const { SFX_PRESETS, LAYERED_SFX_PRESETS } = require('../agents/sfxPresetData');

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
 * GET /sfx/presets — Return curated mathematical SFX sound design recipes.
 */
function handleGetPresets(req, res) {
  try {
    res.json({
      ok: true,
      presets: SFX_PRESETS,
      layeredPresets: LAYERED_SFX_PRESETS,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  handleSynthesize,
  handleSynthesizeLayered,
  handleGetPresets,
};
