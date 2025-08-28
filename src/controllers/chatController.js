const { getSupabaseClient } = require('../config/supabase');
const ragService = require('../services/ragService');
const embeddingsService = require('../services/embeddingsService');
const costService = require('../services/costService');
const ChatSupabase = require('../models/ChatSupabase');
const Chat = require('../models/Chat');
const AgentSupabase = require("../models/AgentSupabase");

// Get chat history for an agent
const getChatHistory = async (req, res) => {
    try {
      const { agentId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const { data, error, count } = await getSupabaseClient()
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
			const { message, sender, chat_id, agent_id } = req.body;

			if (!message) {
				return res.status(400).json({
					error: "Validation error",
					message: "Message is required",
				});
			}

			// Get relevant context using RAG
			const relevantContent = await embeddingsService.searchRelevantContent(
				agent_id,
				message
			);
			console.log("relevantContent", relevantContent);
			// Generate AI response
			const agent = await AgentSupabase.getById(agent_id);
			const chatHistory = await getRecentChatHistory(chat_id);

			const aiResponse = await ragService.generateResponse(
				agent,
				message,
				relevantContent,
				chatHistory
			);

			// Store AI response
			let aiChat = null;

			const { data: userData, error: userError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id,
					role: sender,
					message,
					total_tokens: 0,
					total_cost: 0,
				})
				.select()
				.single();

			if (userError) throw userError;

			const { data: aiData, error: aiError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id: chat_id,
					message: aiResponse.response,
					role: "assistant",
					total_tokens: aiResponse.tokenUsage?.totalTokens,
					total_cost: aiResponse.cost,
				})
				.select()
				.single();

			if (aiError) throw aiError;
			aiChat = aiData;

			// update chat total_tokens and total_cost add this value to the previous value of the chat_id
			const chatDataForUpdate = await ChatSupabase.getById(chat_id);

			const total_tokens =
				chatDataForUpdate.total_tokens + aiResponse.tokenUsage?.totalTokens;
			const total_cost = chatDataForUpdate.total_cost + aiResponse.cost;

			await ChatSupabase.update(chat_id, {
				total_tokens,
				total_cost,
			});

			res.json({
				success: true,
				data: {
					response: aiResponse.response,
					tokensUsed: aiResponse.tokensUsed,
					cost: aiResponse.cost,
				},
			});
		} catch (error) {
			console.error("❌ Error processing message:", error.message);
			res.status(500).json({
				error: "Failed to process message",
				message: error.message,
			});
		}
}

// Summarize conversation for an agent
const summarizeConversation = async (req, res) => {
  try {
    const { agent_id } = req.params;
    
    if (!getSupabaseClient()) {
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
      if (!getSupabaseClient()) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Supabase connection is not available' 
        });
      }

      const { agentId } = req.params;
      
      const { data, error, count } = await getSupabaseClient()
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
const getRecentChatHistory = async (chat_id, limit = 5) => {
    try {
      if (!getSupabaseClient()) {
        return [];
      }

      const { data, error } = await getSupabaseClient()
        .from('chat_logs')
        .select('*')
        .eq('chat_id', chat_id)
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
    
    const { data, error, count } = await getSupabaseClient()
			.from("chats")
			.select("*, leads(*)", { count: "exact" })
			.eq("lead_id", userId)
			.order("created_at", { ascending: false })
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

// Get all recent chats for admin dashboard
const getAllRecentChats = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const chats = await Chat.getRecent(parseInt(limit));
    
    res.json({
      success: true,
      data: chats
    });
  } catch (error) {
    console.error('❌ Error fetching all recent chats:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch all recent chats',
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
  getRecentChats,
  getAllRecentChats
};