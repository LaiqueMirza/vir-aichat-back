const { pool } = require('../config/db');
const ragService = require('../services/ragService');
const embeddingsService = require('../services/embeddingsService');
const costService = require('../services/costService');
const Chat = require('../models/Chat');

// Get chat history for an agent
const getChatHistory = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const result = await pool.query(
        'SELECT * FROM chats WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [agentId, limit, offset]
      );
      
      res.json({
        success: true,
        data: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.rows.length
        }
      });
    } catch (error) {
      console.error('❌ Error fetching chat history:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch chat history',
        message: error.message 
      });
    }
}

// Send a message and get AI response
const sendMessage = async (req, res) => {
    try {
      const { agentId } = req.params;
      const { message, userId } = req.body;
      
      if (!message) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Message is required' 
        });
      }
      
      console.log(`💬 Processing message for agent ${agentId}:`, message.substring(0, 100) + '...');
      
      // Store user message
      let userChat = null;
      if (pool) {
        const userResult = await pool.query(
          'INSERT INTO chats (agent_id, user_id, message, sender, tokens_used, cost) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [agentId, userId || 'anonymous', message, 'user', 0, 0]
        );
        userChat = userResult.rows[0];
      }
      
      // Get relevant context using RAG
      const relevantContent = await embeddingsService.searchRelevantContent(agentId, message);
      
      // Generate AI response
      const aiResponse = await ragService.generateResponse({
        agentId,
        message,
        relevantContent,
        chatHistory: await getRecentChatHistory(agentId)
      });
      
      // Store AI response
      let aiChat = null;
      if (pool) {
        const aiResult = await pool.query(
          'INSERT INTO chats (agent_id, user_id, message, sender, tokens_used, cost) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [agentId, userId || 'anonymous', aiResponse.response, 'assistant', aiResponse.tokensUsed, aiResponse.cost]
        );
        aiChat = aiResult.rows[0];
        
        // Update cost tracking
        await costService.trackCost({
          agentId,
          userId: userId || 'anonymous',
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
          operation: 'chat'
        });
      }
      
      console.log(`✅ Generated response for agent ${agentId} (${aiResponse.tokensUsed} tokens, $${aiResponse.cost.toFixed(4)})`);
      
      res.json({
        success: true,
        data: {
          userMessage: userChat,
          aiResponse: aiChat,
          response: aiResponse.response,
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
          relevantSources: relevantContent.length
        }
      });
    } catch (error) {
      console.error('❌ Error processing message:', error.message);
      res.status(500).json({ 
        error: 'Failed to process message',
        message: error.message 
      });
    }
}

// Get conversation summary
const getConversationSummary = async (req, res) => {
    try {
      const { agentId } = req.params;
      const { limit = 20 } = req.query;
      
      const chatHistory = await getRecentChatHistory(agentId, limit);
      
      if (chatHistory.length === 0) {
        return res.json({
          success: true,
          data: {
            summary: 'No conversation history available.',
            messageCount: 0
          }
        });
      }
      
      const summary = await ragService.generateConversationSummary(chatHistory);
      
      res.json({
        success: true,
        data: {
          summary,
          messageCount: chatHistory.length,
          timeRange: {
            from: chatHistory[chatHistory.length - 1]?.created_at,
            to: chatHistory[0]?.created_at
          }
        }
      });
    } catch (error) {
      console.error('❌ Error generating conversation summary:', error.message);
      res.status(500).json({ 
        error: 'Failed to generate conversation summary',
        message: error.message 
      });
    }
}

// Clear chat history for an agent
const clearChatHistory = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      
      const result = await pool.query('DELETE FROM chats WHERE agent_id = $1', [agentId]);
      
      console.log(`✅ Cleared ${result.rowCount} messages for agent ${agentId}`);
      res.json({
        success: true,
        message: `Cleared ${result.rowCount} messages`,
        deletedCount: result.rowCount
      });
    } catch (error) {
      console.error('❌ Error clearing chat history:', error.message);
      res.status(500).json({ 
        error: 'Failed to clear chat history',
        message: error.message 
      });
    }
}

// Helper method to get recent chat history
const getRecentChatHistory = async (agentId, limit = 10) => {
    try {
      if (!pool) {
        return [];
      }

      const result = await pool.query(
        'SELECT * FROM chats WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
        [agentId, limit]
      );
      
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      console.error('❌ Error fetching recent chat history:', error.message);
      return [];
    }
}

// Get recent chats across all agents (for admin dashboard)
const getRecentChats = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const recentChats = await Chat.getRecent(parseInt(limit));
    
    res.json({
      success: true,
      data: recentChats
    });
  } catch (error) {
    console.error('❌ Error fetching recent chats:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch recent chats',
      message: error.message 
    });
  }
};

module.exports = {
  getChatHistory,
  sendMessage,
  getConversationSummary,
  clearChatHistory,
  getRecentChatHistory,
  getRecentChats
};