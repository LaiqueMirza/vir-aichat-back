const { getSupabaseClient } = require('../config/supabase');
const ragService = require('../services/ragService');
const embeddingsService = require('../services/embeddingsService');
const costService = require('../services/costService');
const ChatSupabase = require('../models/ChatSupabase');
const Chat = require('../models/Chat');
const AgentSupabase = require("../models/AgentSupabase");
const LeadSupabase = require("../models/LeadSupabase");

// Get chat history for an agent (legacy endpoint)
const getChatHistory = async (req, res) => {
  try {
    const { agentId, chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!getSupabaseClient()) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Supabase connection is not available' 
      });
    }
    
    // If chatId is provided, get specific chat history
    if (chatId) {
      const { data: chatLogs, error } = await getSupabaseClient()
        .from('chat_logs')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      if (error) throw error;
      
      // Get total count for pagination
      const { count, error: countError } = await getSupabaseClient()
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId);
      
      if (countError) throw countError;
      
      return res.json({
        success: true,
        data: {
          messages: chatLogs || [],
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: count || 0,
            hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0)
          }
        }
      });
    }
    
    // Legacy behavior for agentId
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

			// Get chat details to extract lead_id
			const chat = await Chat.getById(chat_id);
			const lead_id = chat ? chat.lead_id : null;

      // Get relevant context using RAG
			const embeddingResult = await embeddingsService.searchRelevantContent(
				agent_id,
				message,
				lead_id
			);
			console.log("embeddingResult", embeddingResult);
			
			// Extract relevant content and costs
			const relevantContent = embeddingResult.results || embeddingResult;
			const embeddingTokens = embeddingResult.tokenUsage?.totalTokens || 0;
			const embeddingCost = embeddingResult.cost || 0;
			
			// Generate AI response
			const agent = await AgentSupabase.getById(agent_id);
			const chatHistory = await getRecentChatHistory(chat_id);

      // Get lead info
      const leadInfo = await LeadSupabase.getById(lead_id, "name, email, mobile");

			const aiResponse = await ragService.generateResponse(
				agent,
				message,
				relevantContent,
				chatHistory,
				leadInfo
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

			// Calculate total tokens and cost including embeddings
			const totalResponseTokens = (aiResponse.tokenUsage?.totalTokens || 0) + embeddingTokens;
			const totalResponseCost = (aiResponse.cost || 0) + embeddingCost;
			
			const { data: aiData, error: aiError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id: chat_id,
					message: aiResponse.response,
					role: "assistant",
					total_tokens: totalResponseTokens,
					total_cost: totalResponseCost,
				})
				.select()
				.single();

			if (aiError) throw aiError;
			aiChat = aiData;

			// update chat total_tokens and total_cost add this value to the previous value of the chat_id
			const chatDataForUpdate = await ChatSupabase.getById(chat_id);

			const total_tokens =
				chatDataForUpdate.total_tokens + totalResponseTokens;
			const total_cost = chatDataForUpdate.total_cost + totalResponseCost;

			await ChatSupabase.update(chat_id, {
				total_tokens,
				total_cost,
			});

			res.json({
				success: true,
				data: {
					response: aiResponse.response,
					tokensUsed: {
						ai: aiResponse.tokenUsage?.totalTokens || 0,
						embedding: embeddingTokens,
						total: totalResponseTokens
					},
					cost: {
						ai: aiResponse.cost || 0,
						embedding: embeddingCost,
						total: totalResponseCost
					},
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

// Get chat logs for a specific chat
const getChatLogs = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    if (!chatId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Chat ID is required'
      });
    }
    
    // Get chat logs with proper error handling
    const { data: chatLogs, error } = await getSupabaseClient()
      .from('chat_logs')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    if (error) {
      throw error;
    }
    
    // Get chat metadata with enhanced data fetching
    const { data: chatData, error: chatError } = await getSupabaseClient()
      .from('chats')
      .select(`
        *,
        agents(name, agent_id),
        leads(name, email, mobile, lead_id)
      `)
      .eq('chat_id', chatId)
      .single();
    
    if (chatError) {
      console.warn('⚠️ Chat metadata not found, proceeding with logs only:', chatError.message);
    }
    
    // Process and enhance chat logs with null handling
    const processedLogs = (chatLogs || []).map(log => ({
      ...log,
      message: log.message || '',
      role: log.role || 'unknown',
      total_tokens: log.total_tokens || 0,
      total_cost: log.total_cost || 0,
      created_at: log.created_at || new Date().toISOString(),
      updated_at: log.updated_at || log.created_at || new Date().toISOString()
    }));
    
    // Process chat metadata with comprehensive null handling
    const processedChat = chatData ? {
      ...chatData,
      chat_id: chatData.chat_id || chatId,
      user_id: chatData.user_id || null,
      agent_id: chatData.agent_id || null,
      lead_id: chatData.lead_id || null,
      total_tokens: chatData.total_tokens || 0,
      total_cost: chatData.total_cost || 0,
      status: chatData.status || 'active',
      created_at: chatData.created_at || new Date().toISOString(),
      updated_at: chatData.updated_at || chatData.created_at || new Date().toISOString(),
      // Agent information with null handling
      agent_name: chatData.agents?.name || 'Unknown Agent',
      agent_id_ref: chatData.agents?.agent_id || chatData.agent_id,
      // Lead information with null handling
      client_name: chatData.leads?.name || null,
      client_email: chatData.leads?.email || null,
      client_mobile: chatData.leads?.mobile || null,
      client_id: chatData.leads?.lead_id || chatData.lead_id
    } : {
      chat_id: chatId,
      user_id: null,
      agent_id: null,
      lead_id: null,
      total_tokens: 0,
      total_cost: 0,
      status: 'unknown',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      agent_name: 'Unknown Agent',
      agent_id_ref: null,
      client_name: null,
      client_email: null,
      client_mobile: null,
      client_id: null
    };
    
    // Calculate summary statistics
    const totalMessages = processedLogs.length;
    const totalTokensSum = processedLogs.reduce((sum, log) => sum + (log.total_tokens || 0), 0);
    const totalCostSum = processedLogs.reduce((sum, log) => sum + (parseFloat(log.total_cost) || 0), 0);
    const userMessages = processedLogs.filter(log => log.role === 'user').length;
    const assistantMessages = processedLogs.filter(log => log.role === 'assistant').length;
    
    res.json({
      success: true,
      data: {
        chat_id: chatId,
        user_id: processedChat.user_id,
        agent_id: processedChat.agent_id,
        lead_id: processedChat.lead_id,
        total_tokens: Math.max(processedChat.total_tokens, totalTokensSum),
        total_cost: Math.max(processedChat.total_cost, totalCostSum),
        status: processedChat.status,
        created_at: processedChat.created_at,
        updated_at: processedChat.updated_at,
        agent_name: processedChat.agent_name,
        client_name: processedChat.client_name,
        client_email: processedChat.client_email,
        client_mobile: processedChat.client_mobile,
        summary: {
          total_messages: totalMessages,
          user_messages: userMessages,
          assistant_messages: assistantMessages,
          total_tokens: totalTokensSum,
          total_cost: totalCostSum.toFixed(4)
        },
        chat_logs: processedLogs
      }
    });
  } catch (error) {
    console.error('❌ Error fetching chat logs:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch chat logs',
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
  getAllRecentChats,
  getChatLogs
};