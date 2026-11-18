const fs = require('fs');
const path = require('path');
const {
  listAllDocuments,
  getDocumentDetails,
  deleteDocument,
} = require('../services/pinecone.service');

const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

/**
 * GET /documents — List all unique documents in the vector store with chunk counts.
 */
async function getDocuments(req, res) {
  try {
    const { limit, namespace } = req.query;
    const result = await listAllDocuments({ limit, namespace });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('getDocuments error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * GET /documents/:id — Fetch a single document with all its chunks and full text.
 */
async function getDocumentById(req, res) {
  try {
    const { id } = req.params;
    const { namespace } = req.query;

    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: 'Document id is required' });
    }

    const doc = await getDocumentDetails(id, namespace);
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'Document not found' });
    }

    res.json({ ok: true, document: doc });
  } catch (err) {
    console.error('getDocumentById error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * DELETE /documents/:id — Delete all chunks for a document from Pinecone and remove its uploaded file if present.
 */
async function deleteDocumentById(req, res) {
  try {
    const { id } = req.params;
    const { namespace } = req.query;

    if (!id) {
      return res
        .status(400)
        .json({ ok: false, error: 'Document id is required' });
    }

    const result = await deleteDocument(id, namespace);
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Document not found' });
    }

    let fileDeleted = false;
    const candidateName = path.basename(result.filename || id);
    if (candidateName) {
      const filePath = path.join(UPLOADS_DIR, candidateName);
      try {
        await fs.promises.unlink(filePath);
        fileDeleted = true;
      } catch (fsErr) {
        if (fsErr.code !== 'ENOENT') {
          console.warn('Upload cleanup warning:', fsErr.message);
        }
      }
    }

    res.json({
      ok: true,
      id: result.id,
      deletedChunksCount: result.deletedChunksCount,
      fileDeleted,
    });
  } catch (err) {
    console.error('deleteDocumentById error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getDocuments,
  getDocumentById,
  deleteDocumentById,
};
