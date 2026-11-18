const {
  ai,
  GEMINI_EMBED_MODEL,
  GEMINI_CHAT_MODEL,
} = require('../config/gemini');


async function generateEmbedding(text) {
  const response = await ai.models.embedContent({
    model: GEMINI_EMBED_MODEL,
    contents: text,
    config: { outputDimensionality: 768 },
  });
  return response.embeddings[0].values;
}


async function generateResponse(prompt) {
  const response = await ai.models.generateContent({
    model: GEMINI_CHAT_MODEL,
    contents: prompt,
  });
  return response.text;
}

async function generateResponseStream(prompt) {
  return ai.models.generateContentStream({
    model: GEMINI_CHAT_MODEL,
    contents: prompt,
  });
}

module.exports = {
  generateEmbedding,
  generateResponse,
  generateResponseStream,
};
