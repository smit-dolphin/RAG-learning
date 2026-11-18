const express = require('express');
const {
  handleChat,
  handleChatStream,
} = require('../controllers/chat.controller');

const router = express.Router();

router.get('/chat', handleChat);
router.post('/chat', handleChat);
router.get('/chat/stream', handleChatStream);
router.post('/chat/stream', handleChatStream);

module.exports = router;
