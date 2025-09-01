const express = require('express');
const chatController = require('../controllers/chatController');
const router = express.Router();

// Get chat history for an agent
router.get('/:agentId/chat', chatController.getChatHistory);

// Send a message and get AI response
router.post('/message', chatController.sendMessage);

// Get conversation summary
router.get('/:agentId/chat/summary', chatController.summarizeConversation);

// Clear chat history for an agent
router.delete('/:agentId/chat', chatController.clearChatHistory);

// Get recent chats for a user
router.get('/user/:userId/recent', chatController.getRecentChats);

// Get all recent chats for admin dashboard
router.get('/admin/recent', chatController.getAllRecentChats);

// Get chat logs for a specific chat
router.get('/logs/:chatId', chatController.getChatLogs);

// Get chat history for message persistence (new endpoint)
router.get('/history/:chatId', chatController.getChatHistory);

module.exports = router;