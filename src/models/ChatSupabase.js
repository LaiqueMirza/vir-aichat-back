const { getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new chat session
const create = async (agentId, lead_id = null) => {
  try {
    const { data, error } = await getSupabaseClient()
			.from("chats")
			.insert({
				agent_id: agentId,
				lead_id: lead_id,
				total_tokens: 0,
				total_cost: 0.0,
			})
			.select()
			.single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get chat by ID
const getById = async (chat_id) => {
  try {
    // Using a join to get lead information
    const { data, error } = await getSupabaseClient()
      .from('chats')
      .select(`
        *
      `)
      .eq('chat_id', chat_id)
      .single();
    
    if (error) throw error;
    
    // Format the response to match the expected structure
    if (data) {
      return {
				...data,
				client_name: data.leads?.name,
				client_email: data.leads?.email,
				client_mobile: data.leads?.mobile,
			};
    }
    
    return null;
  } catch (error) {
    throw error;
  }
}

// Update chat with new message
const addMessage = async (chatId, message, tokenCount = 0, cost = 0) => {
  try {
    // Get current chat
    const { data: currentChat, error: fetchError } = await getSupabaseClient()
      .from('chats')
      .select('messages, total_tokens, total_cost')
      .eq('chat_id', chatId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!currentChat) throw new Error('Chat not found');
    
    const currentMessages = currentChat.messages || [];
    const currentTokenCount = currentChat.total_tokens || 0;
    const currentCost = parseFloat(currentChat.total_cost) || 0;
    
    // Add new message with timestamp
    const newMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };
    
    const updatedMessages = [...currentMessages, newMessage];
    const updatedTokenCount = currentTokenCount + tokenCount;
    const updatedCost = currentCost + cost;
    
    // Update chat
    const { data, error } = await getSupabaseClient()
      .from('chats')
      .update({
        messages: updatedMessages,
        total_tokens: updatedTokenCount,
        total_cost: updatedCost
      })
      .eq('chat_id', chatId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Link chat to a lead
const linkToLead = async (chatId, leadId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('chats')
      .update({ lead_id: leadId })
      .eq('chat_id', chatId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get recent chat history for a client
const getRecentChatHistory = async (clientId, limit = 50) => {
  try {
    const { data, error } = await getSupabaseClient()
			.from("chats")
			.select("*")
			.eq("lead_id", clientId)
			.order("created_at", { ascending: false })
			.limit(limit);
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get recent chats for an agent
const getRecentChats = async (agentId, limit = 10) => {
  try {
    const { data, error } = await getSupabaseClient()
			.from("chats")
			.select(
				`
        *,
        leads!chats_lead_id_fkey (name, email, mobile)
      `
			)
			.eq("agent_id", agentId)
			.order("created_at", { ascending: false })
			.limit(limit);
    
    if (error) throw error;
    
    // Format the response to match the expected structure
    return data.map((chat) => ({
			...chat,
			client_name: chat.leads?.name,
			client_email: chat.leads?.email,
			client_mobile: chat.leads?.mobile,
		}));
  } catch (error) {
    throw error;
  }
}

// Clear chat history for a client
const clearChatHistory = async (clientId) => {
  try {
    const { data, error } = await getSupabaseClient()
			.from("chats")
			.delete()
			.eq("lead_id", clientId);
    
    if (error) throw error;
    return { success: true, message: 'Chat history cleared' };
  } catch (error) {
    throw error;
  }
}

// Get conversation summary
const getConversationSummary = async (chatId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('chats')
      .select('messages')
      .eq('chat_id', chatId)
      .single();
    
    if (error) throw error;
    
    if (!data || !data.messages || data.messages.length === 0) {
      return { summary: 'No conversation found' };
    }
    
    // Extract just the content from messages
    const messageContents = data.messages.map(msg => msg.content || '');
    return { messages: messageContents };
  } catch (error) {
    throw error;
  }
}

// Update chat record
const update = async (chat_id, updateData) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('chats')
      .update(updateData)
      .eq('chat_id', chat_id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getById,
  addMessage,
  linkToLead,
  getRecentChatHistory,
  getRecentChats,
  clearChatHistory,
  getConversationSummary,
  update
};