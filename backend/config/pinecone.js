const { Pinecone } = require('@pinecone-database/pinecone');

if (!process.env.PINECONE_API_KEY) {
  throw new Error('Missing PINECONE_API_KEY in environment variables');
}

if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('Missing PINECONE_INDEX_NAME in environment variables');
}

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pc.index({ name: process.env.PINECONE_INDEX_NAME });

module.exports = {
  pc,
  pineconeIndex,
};
