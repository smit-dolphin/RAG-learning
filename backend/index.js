require('dotenv').config();
const express = require('express');
const cors = require('cors');

const ingestRoutes = require('./routes/ingest.routes');
const chatRoutes = require('./routes/chat.routes');
const statusRoutes = require('./routes/status.routes');
const documentsRoutes = require('./routes/documents.routes');
const sfxRoutes = require('./routes/sfx.routes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.send('RAG Backend Server is running');
});

app.use(ingestRoutes);
app.use(chatRoutes);
app.use(statusRoutes);
app.use(documentsRoutes);
app.use(sfxRoutes);

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});
