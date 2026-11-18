const express = require('express');
const router = express.Router();
const {
  handleSynthesize,
  handleSynthesizeLayered,
  handleComposeBgm,
  handleComposeAcoustic,
  handleGetPresets,
} = require('../controllers/sfx.controller');

router.post('/sfx/synthesize', handleSynthesize);
router.post('/sfx/layered', handleSynthesizeLayered);
router.post('/sfx/bgm', handleComposeBgm);
router.post('/sfx/acoustic', handleComposeAcoustic);
router.get('/sfx/presets', handleGetPresets);

module.exports = router;
