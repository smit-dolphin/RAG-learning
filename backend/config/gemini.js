const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY in environment variables');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const GEMINI_CHAT_MODEL = 'gemini-3.5-flash-lite';

module.exports = {
  ai,
  GEMINI_EMBED_MODEL,
  GEMINI_CHAT_MODEL,
};
