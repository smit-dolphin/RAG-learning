const { getIndexStats } = require('../services/pinecone.service');

/**
 * GET /status — Return Pinecone index health and record statistics.
 */
async function getStatus(req, res) {
  try {
    const stats = await getIndexStats();
    res.json({
      status: 'online',
      index: process.env.PINECONE_INDEX_NAME,
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getStatus,
};
