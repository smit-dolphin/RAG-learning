const express = require('express');
const {
  getDocuments,
  getDocumentById,
  deleteDocumentById,
} = require('../controllers/documents.controller');

const router = express.Router();

router.get('/documents', getDocuments);
router.get('/documents/:id', getDocumentById);
router.delete('/documents/:id', deleteDocumentById);

module.exports = router;
