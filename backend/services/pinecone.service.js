const { pineconeIndex } = require('../config/pinecone');

async function upsertDocument({
  id,
  values,
  title = '',
  text = '',
  metadata = {},
  namespace,
}) {
  if (!id) {
    throw new Error('Document id is required');
  }
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Valid vector values array is required');
  }

  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  // Schema-based Document Index approach
  if (docClient && typeof docClient.upsert === 'function') {
    try {
      const docPayload = {
        _id: id,
        title: title || metadata.title || id,
        embedding: values,
        text: text || metadata.text || '',
        ...metadata,
      };

      const result = await docClient.upsert({
        documents: [docPayload],
      });
      return result;
    } catch (err) {
      // If schema rejects extra fields, retry with known fields (_id, title, embedding)
      if (err.message && err.message.includes('schema')) {
        return await docClient.upsert({
          documents: [
            {
              _id: id,
              title: title || metadata.title || id,
              embedding: values,
            },
          ],
        });
      }
      throw err;
    }
  }

  // Fallback for standard non-schema vector indexes
  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  return await targetIndex.upsert({
    records: [
      {
        id,
        values,
        metadata: {
          title: title || id,
          text,
          ...metadata,
        },
      },
    ],
  });
}

async function searchSimilar({ vector, topK = 5, namespace }) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Vector array is required for similarity search');
  }

  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  // 1. Try Document-Schema search endpoint
  if (docClient && typeof docClient.search === 'function') {
    try {
      const response = await docClient.search({
        scoreBy: [
          {
            type: 'dense_vector',
            field: 'embedding',
            values: vector,
          },
        ],
        topK,
        includeFields: ['title', 'text'],
      });

      const matches = response.matches || [];
      return matches.map((match) => ({
        id: match._id || match.id,
        score: match._score ?? match.score ?? 0,
        metadata: {
          title: match.title || match.fields?.title || '',
          text: match.text || match.fields?.text || '',
          ...(match.fields || {}),
        },
      }));
    } catch (err) {
      // If error is not schema-related, rethrow
      if (!err.message || !err.message.includes('documents')) {
        throw err;
      }
    }
  }

  // 2. Fallback for standard vector index
  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  const result = await targetIndex.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (result.matches || []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    metadata: m.metadata || {},
  }));
}

async function deleteDocument(id, namespace) {
  if (!id) throw new Error('Document id is required for deletion');

  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  if (docClient && typeof docClient.delete === 'function') {
    await docClient.delete({ ids: [id] });
    return;
  }

  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;
  await targetIndex.deleteOne(id);
}


async function getIndexStats() {
  return await pineconeIndex.describeIndexStats();
}

module.exports = {
  upsertDocument,
  searchSimilar,
  deleteDocument,
  getIndexStats,
};
