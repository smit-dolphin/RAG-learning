const express = require('express');
const router = express.Router();
const {
  handleSynthesize,
  handleSynthesizeLayered,
  handleGetPresets,
} = require('../controllers/sfx.controller');

router.post('/sfx/synthesize', handleSynthesize);
router.post('/sfx/layered', handleSynthesizeLayered);
router.get('/sfx/presets', handleGetPresets);

module.exports = router;
