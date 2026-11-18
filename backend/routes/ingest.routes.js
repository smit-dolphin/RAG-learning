const express = require('express');
const { upload } = require('../middleware/upload');
const {
  ingestDocumentController,
  ingestFileController,
} = require('../controllers/ingest.controller');

const router = express.Router();

router.post('/ingest', ingestDocumentController);
router.post('/ingest/file', upload.single('file'), ingestFileController);

module.exports = router;
