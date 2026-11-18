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

const parsedMinScore = Number(process.env.RAG_MIN_SCORE);
const DEFAULT_MIN_SCORE =
  Number.isFinite(parsedMinScore) && parsedMinScore >= 0 && parsedMinScore <= 1
    ? parsedMinScore
    : 0.45;

/**
 * Filter and sort similarity matches above minScore, dropping tangential chunks far below the top match.
 */
function filterByMinScore(matches, minScore) {
  const threshold =
    typeof minScore === 'number' && Number.isFinite(minScore) ? minScore : 0;

  const passing = matches
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (passing.length <= 1) {
    return passing;
  }

  const topScore = passing[0].score;
  const relativeFloor = topScore * 0.8;
  return passing.filter((m) => m.score >= relativeFloor);
}

/**
 * Extract the parent document ID from chunk metadata or chunk ID (`<docId>-<index>`).
 */
function getParentDocId(match) {
  return match.metadata?.docId || String(match.id).replace(/-\d+$/, '');
}

/**
 * Execute a raw vector similarity query against Document-Schema or standard Pinecone index.
 */
async function runVectorQuery({ vector, topK, namespace, filter }) {
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
        includeFields: ['title', 'text', 'docId'],
        ...(filter ? { filter } : {}),
      });

      return (response.matches || []).map((match) => ({
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
    ...(filter ? { filter } : {}),
  });

  return (result.matches || []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    metadata: m.metadata || {},
  }));
}

async function searchSimilar({
  vector,
  topK = 5,
  namespace,
  minScore = DEFAULT_MIN_SCORE,
  allowedDocIds,
}) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Vector array is required for similarity search');
  }

  const hasAllowedDocs =
    Array.isArray(allowedDocIds) && allowedDocIds.length > 0;

  if (hasAllowedDocs) {
    const allowedSet = new Set(allowedDocIds.map(String));
    // Prefer native Pinecone metadata filter on `docId`
    let matches = await runVectorQuery({
      vector,
      topK,
      namespace,
      filter: { docId: { $in: [...allowedSet] } },
    });

    // Fallback for legacy chunks ingested before `docId` was stored in metadata
    if (matches.length === 0) {
      const candidates = await runVectorQuery({
        vector,
        topK: Math.max(topK * 6, 30),
        namespace,
      });
      matches = candidates.filter((m) => allowedSet.has(getParentDocId(m)));
    }

    return filterByMinScore(matches, minScore).slice(0, topK);
  }

  const matches = await runVectorQuery({ vector, topK, namespace });
  return filterByMinScore(matches, minScore);
}

/**
 * Resolve all chunk IDs belonging to a base document ID (or exact single chunk ID).
 */
async function resolveChunkIds(id, namespace) {
  const regex = new RegExp('^' + escapeRegex(id) + '(-(\\d+))?$');
  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  if (docClient && typeof docClient.fetch === 'function') {
    const matchedIds = [];

    if (typeof docClient.list === 'function') {
      let paginationToken;
      do {
        const prefixRes = await docClient.list({
          prefix: id,
          limit: 100,
          ...(paginationToken ? { paginationToken } : {}),
        });
        const pageIds = (prefixRes.documents || [])
          .map((d) => d._id || d.id)
          .filter((chunkId) => regex.test(chunkId));
        matchedIds.push(...pageIds);
        paginationToken = prefixRes.pagination?.next;
      } while (paginationToken);
    }

    if (matchedIds.length === 0) {
      const singleFetch = await docClient.fetch({ ids: [id] });
      if (singleFetch.documents && singleFetch.documents[id]) {
        matchedIds.push(id);
      }
    }

    return matchedIds;
  }

  // Fallback for standard non-schema vector indexes
  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  const matchedIds = [];
  if (typeof targetIndex.listPaginated === 'function') {
    let paginationToken;
    do {
      const prefixRes = await targetIndex.listPaginated({
        prefix: id,
        limit: 100,
        ...(paginationToken ? { paginationToken } : {}),
      });
      const pageIds = (prefixRes.vectors || [])
        .map((r) => r.id)
        .filter((chunkId) => regex.test(chunkId));
      matchedIds.push(...pageIds);
      paginationToken = prefixRes.pagination?.next;
    } while (paginationToken);
  }

  if (matchedIds.length === 0) {
    const singleFetch = await targetIndex.fetch([id]);
    if (singleFetch.records && singleFetch.records[id]) {
      matchedIds.push(id);
    }
  }

  return matchedIds;
}

/**
 * Delete a document and all of its chunks from Pinecone.
 * Returns null if no matching document/chunks exist.
 */
async function deleteDocument(id, namespace) {
  if (!id) throw new Error('Document id is required for deletion');

  const matchedIds = await resolveChunkIds(id, namespace);
  if (matchedIds.length === 0) {
    return null;
  }

  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  if (docClient && typeof docClient.delete === 'function') {
    let filename = null;
    try {
      const firstFetch = await docClient.fetch({ ids: [matchedIds[0]] });
      filename = firstFetch.documents?.[matchedIds[0]]?.filename || null;
    } catch {
      // Ignore metadata lookup errors; proceed with deletion
    }

    await docClient.delete({ ids: matchedIds });
    return {
      id,
      deletedChunksCount: matchedIds.length,
      filename,
    };
  }

  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  let filename = null;
  try {
    const firstFetch = await targetIndex.fetch([matchedIds[0]]);
    filename = firstFetch.records?.[matchedIds[0]]?.metadata?.filename || null;
  } catch {
    // Ignore metadata lookup errors; proceed with deletion
  }

  if (matchedIds.length === 1) {
    await targetIndex.deleteOne(matchedIds[0]);
  } else {
    await targetIndex.deleteMany(matchedIds);
  }

  return {
    id,
    deletedChunksCount: matchedIds.length,
    filename,
  };
}


async function getIndexStats() {
  return await pineconeIndex.describeIndexStats();
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List all unique documents in Pinecone by grouping chunk IDs by base document ID.
 */
async function listAllDocuments({ limit = 100, namespace } = {}) {
  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  if (docClient && typeof docClient.list === 'function') {
    const listRes = await docClient.list({ limit: Number(limit) || 100 });
    const rawDocs = listRes.documents || [];
    const allIds = rawDocs.map((d) => d._id || d.id);

    // Group chunk IDs by base document ID (strip trailing -\d+)
    const docGroups = {};
    for (const id of allIds) {
      const lastDash = id.lastIndexOf('-');
      const baseId = lastDash > 0 ? id.substring(0, lastDash) : id;
      if (!docGroups[baseId]) {
        docGroups[baseId] = [];
      }
      docGroups[baseId].push(id);
    }

    const baseIds = Object.keys(docGroups);
    if (baseIds.length === 0) {
      return { documents: [], totalDocuments: 0, totalRecords: 0 };
    }

    // Fetch the first chunk of each unique document to extract metadata
    const firstChunkIds = baseIds.map((bId) => docGroups[bId][0]);
    const fetched = await docClient.fetch({ ids: firstChunkIds });
    const fetchedMap = fetched.documents || {};

    const documents = baseIds.map((baseId) => {
      const firstChunkId = docGroups[baseId][0];
      const chunkData = fetchedMap[firstChunkId] || {};
      const title =
        chunkData.originalname ||
        (chunkData.title ? chunkData.title.replace(/-\d+$/, '') : baseId);

      return {
        id: baseId,
        title,
        chunksCount: docGroups[baseId].length,
        preview: chunkData.text ? chunkData.text.substring(0, 160) : '',
        originalname: chunkData.originalname || null,
        filename: chunkData.filename || null,
        firstChunkId,
      };
    });

    return {
      documents,
      totalDocuments: documents.length,
      totalRecords: allIds.length,
      pagination: listRes.pagination || null,
    };
  }

  // Fallback for standard non-schema vector indexes
  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  const listRes = await targetIndex.listPaginated({ limit: Number(limit) || 100 });
  const records = listRes.vectors || [];
  const allIds = records.map((r) => r.id);

  const docGroups = {};
  for (const id of allIds) {
    const lastDash = id.lastIndexOf('-');
    const baseId = lastDash > 0 ? id.substring(0, lastDash) : id;
    if (!docGroups[baseId]) {
      docGroups[baseId] = [];
    }
    docGroups[baseId].push(id);
  }

  const baseIds = Object.keys(docGroups);
  if (baseIds.length === 0) {
    return { documents: [], totalDocuments: 0, totalRecords: 0 };
  }

  const firstChunkIds = baseIds.map((bId) => docGroups[bId][0]);
  const fetched = await targetIndex.fetch(firstChunkIds);
  const fetchedMap = fetched.records || {};

  const documents = baseIds.map((baseId) => {
    const firstChunkId = docGroups[baseId][0];
    const rec = fetchedMap[firstChunkId] || {};
    const meta = rec.metadata || {};
    const title =
      meta.originalname ||
      (meta.title ? meta.title.replace(/-\d+$/, '') : baseId);

    return {
      id: baseId,
      title,
      chunksCount: docGroups[baseId].length,
      preview: meta.text ? meta.text.substring(0, 160) : '',
      originalname: meta.originalname || null,
      filename: meta.filename || null,
      firstChunkId,
    };
  });

  return {
    documents,
    totalDocuments: documents.length,
    totalRecords: allIds.length,
    pagination: listRes.pagination || null,
  };
}

/**
 * Fetch a single document by ID with all its chunks and full text.
 */
async function getDocumentDetails(id, namespace) {
  if (!id) {
    throw new Error('Document id is required');
  }

  const matchedIds = await resolveChunkIds(id, namespace);
  if (matchedIds.length === 0) {
    return null;
  }

  const docClient = namespace
    ? pineconeIndex.namespace(namespace).documents
    : pineconeIndex.documents;

  if (docClient && typeof docClient.fetch === 'function') {
    const fetched = await docClient.fetch({ ids: matchedIds });
    const docsMap = fetched.documents || {};

    const chunks = Object.values(docsMap)
      .map((c) => {
        const chunkId = c._id || c.id;
        const match = chunkId.match(/-(\d+)$/);
        const index = match ? parseInt(match[1], 10) : 0;
        return {
          id: chunkId,
          title: c.title,
          text: c.text || '',
          index,
        };
      })
      .sort((a, b) => a.index - b.index);

    if (chunks.length === 0) {
      return null;
    }

    const firstChunk = chunks[0] || {};
    const firstChunkRaw = docsMap[firstChunk.id] || {};
    const title =
      firstChunkRaw.originalname ||
      (firstChunk.title ? firstChunk.title.replace(/-\d+$/, '') : id);

    const fullText = chunks
      .map((c) => c.text)
      .filter(Boolean)
      .join('\n\n');

    return {
      id,
      title,
      originalname: firstChunkRaw.originalname || null,
      filename: firstChunkRaw.filename || null,
      chunksCount: chunks.length,
      fullText,
      chunks,
    };
  }

  // Fallback for standard non-schema vector indexes
  const targetIndex = namespace
    ? pineconeIndex.namespace(namespace)
    : pineconeIndex;

  const fetched = await targetIndex.fetch(matchedIds);
  const recordsMap = fetched.records || {};

  const chunks = Object.values(recordsMap)
    .map((r) => {
      const match = r.id.match(/-(\d+)$/);
      const index = match ? parseInt(match[1], 10) : 0;
      const meta = r.metadata || {};
      return {
        id: r.id,
        title: meta.title || r.id,
        text: meta.text || '',
        index,
      };
    })
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) {
    return null;
  }

  const firstChunk = chunks[0] || {};
  const firstChunkMeta = recordsMap[firstChunk.id]?.metadata || {};
  const title =
    firstChunkMeta.originalname ||
    (firstChunk.title ? firstChunk.title.replace(/-\d+$/, '') : id);

  const fullText = chunks
    .map((c) => c.text)
    .filter(Boolean)
    .join('\n\n');

  return {
    id,
    title,
    originalname: firstChunkMeta.originalname || null,
    filename: firstChunkMeta.filename || null,
    chunksCount: chunks.length,
    fullText,
    chunks,
  };
}

module.exports = {
  upsertDocument,
  searchSimilar,
  deleteDocument,
  getIndexStats,
  listAllDocuments,
  getDocumentDetails,
};
