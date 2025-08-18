const { supabaseClient } = require('../config/supabase');
const ragService = require('../services/ragService');
const embeddingsService = require('../services/embeddingsService');
const costService = require('../services/costService');
const ChatSupabase = require('../models/ChatSupabase');

// Get chat history for an agent
const getChatHistory = async (req, res) => {
    try {
      if (!supabaseClient) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Supabase connection is not available' 
        });
      }

      const { agentId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const { data, error, count } = await supabaseClient
        .from('chats')
        .select('*', { count: 'exact' })
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .range(offset, parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;
      
      res.json({
        success: true,
        data: data,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: count
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
      const { message, userId, lead_id } = req.body;
      
      if (!message) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Message is required' 
        });
      }
      
      console.log(`💬 Processing message for agent ${agentId}:`, message.substring(0, 100) + '...');
      
      // Store user message
      let userChat = null;
      if (supabaseClient) {
        // Include lead_id if provided
        const userMessage = { role: 'user', content: message };
        const insertData = {
          agent_id: agentId,
          client_id: userId || 'anonymous',
          messages: [userMessage],
          total_tokens: 0,
          total_cost: 0
        };
        
        if (lead_id) {
          insertData.lead_id = lead_id;
        }
        
        const { data: userData, error: userError } = await supabaseClient
          .from('chats')
          .insert(insertData)
          .select()
          .single();
        
        if (userError) throw userError;
        userChat = userData;
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
      if (supabaseClient) {
        const assistantMessage = { role: 'assistant', content: aiResponse.response };
        const insertData = {
          agent_id: agentId,
          client_id: userId || 'anonymous',
          messages: [assistantMessage],
          total_tokens: aiResponse.tokensUsed,
          total_cost: aiResponse.cost
        };
        
        if (lead_id) {
          insertData.lead_id = lead_id;
        }
        
        const { data: aiData, error: aiError } = await supabaseClient
          .from('chats')
          .insert(insertData)
          .select()
          .single();
        
        if (aiError) throw aiError;
        aiChat = aiData;
        
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

// Summarize conversation for an agent
const summarizeConversation = async (req, res) => {
  try {
    const { agentId } = req.params;
    
    if (!supabaseClient) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Supabase connection is not available' 
      });
    }
    
    // Get recent chat history
    const chatHistory = await getRecentChatHistory(agentId, 50);
    
    if (chatHistory.length === 0) {
      return res.json({
        success: true,
        summary: 'No conversation history found.'
      });
    }
    
    // Generate summary using OpenAI
    const summary = await ragService.summarizeConversation(chatHistory);
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('❌ Error summarizing conversation:', error.message);
    res.status(500).json({ 
      error: 'Failed to summarize conversation',
      message: error.message 
    });
  }
}

// Clear chat history for an agent
const clearChatHistory = async (req, res) => {
    try {
      if (!supabaseClient) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Supabase connection is not available' 
        });
      }

      const { agentId } = req.params;
      
      const { data, error, count } = await supabaseClient
        .from('chats')
        .delete()
        .eq('agent_id', agentId);
      
      if (error) throw error;
      
      console.log(`✅ Cleared chat messages for agent ${agentId}`);
      res.json({
        success: true,
        message: `Chat history cleared for agent ${agentId}`
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
      if (!supabaseClient) {
        return [];
      }

      const { data, error } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      return data.reverse(); // Return in chronological order
    } catch (error) {
      console.error('❌ Error fetching recent chat history:', error.message);
      return [];
    }
}

// Get recent chats for a user
const getRecentChats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const { data, error, count } = await supabaseClient
      .from('chats')
      .select('*, leads(*)', { count: 'exact' })
      .eq('client_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, parseInt(offset) + parseInt(limit) - 1);
    
    if (error) throw error;
    
    res.json({
      success: true,
      data: data,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count
      }
    });
  } catch (error) {
    console.error('❌ Error fetching recent chats:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch recent chats',
      message: error.message 
    });
  }
}

module.exports = {
  getChatHistory,
  sendMessage,
  summarizeConversation,
  clearChatHistory,
  getRecentChatHistory,
  getRecentChats
};