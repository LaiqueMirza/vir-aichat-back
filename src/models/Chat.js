const { supabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new chat session
const create = async (agentId, clientId = null) => {
  try {
    const id = uuidv4();
    const { data, error } = await supabaseClient
      .from('chats')
      .insert([{ 
        id, 
        agent_id: agentId, 
        client_id: clientId, 
        messages: [], 
        total_tokens: 0, 
        total_cost: 0.00 
      }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get chat by ID
const getById = async (id) => {
  try {
    // Get chat data
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('*')
      .eq('id', id)
      .single();
      
    if (chatError) throw chatError;
    
    // If chat has a client_id, get client data
    if (chat.client_id) {
      const { data: client, error: clientError } = await supabaseClient
        .from('leads')
        .select('name, email, phone')
        .eq('id', chat.client_id)
        .single();
        
      if (!clientError && client) {
        // Add client data to chat object
        return {
          ...chat,
          client_name: client.name,
          client_email: client.email,
          client_phone: client.phone
        };
      }
    }
    
    return chat;
  } catch (error) {
    throw error;
  }
}

// Update chat with new message
const addMessage = async (chatId, message, tokenCount = 0, cost = 0) => {
  try {
    // Get current chat
    const { data: currentChat, error: getCurrentError } = await supabaseClient
      .from('chats')
      .select('messages, total_tokens, total_cost')
      .eq('id', chatId)
      .single();
      
    if (getCurrentError) throw getCurrentError;
    if (!currentChat) {
        throw new Error('Chat not found');
      }

      // Extract current values
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
      const { data, error } = await supabaseClient
        .from('chats')
        .update({ 
          messages: updatedMessages, 
          total_tokens: updatedTokenCount, 
          total_cost: updatedCost 
        })
        .eq('id', chatId)
        .select()
        .single()
;
      
      if (error) throw error;
      return data;
    } catch (error) {
      throw error;
    }
  }

// Link chat to a lead
const linkToLead = async (chatId, leadId) => {
  try {
    const { data, error } = await supabaseClient
      .from('chats')
      .update({ client_id: leadId })
      .eq('id', chatId)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all chats for an agent
const getByAgentId = async (agentId, limit = 50, offset = 0) => {
  try {
    // Get chats for the agent
    const { data: chats, error: chatsError } = await supabaseClient
      .from('chats')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (chatsError) throw chatsError;
    
    // Get client information for chats with client_id
    const chatsWithClientInfo = await Promise.all(chats.map(async (chat) => {
      if (chat.client_id) {
        const { data: client, error: clientError } = await supabaseClient
          .from('leads')
          .select('name, email, phone')
          .eq('id', chat.client_id)
          .single();
          
        if (!clientError && client) {
          return {
            ...chat,
            client_name: client.name,
            client_email: client.email,
            client_phone: client.phone
          };
        }
      }
      return chat;
    }));
    
    return chatsWithClientInfo;
  } catch (error) {
    throw error;
  }
}

// Get chat statistics for an agent
const getStatsByAgentId = async (agentId, startDate = null, endDate = null) => {
  try {
    let query = supabaseClient
      .from('chats')
      .select('*')
      .eq('agent_id', agentId);
    
    // Add date filters if provided
    if (startDate && endDate) {
      query = query
        .gte('created_at', startDate)
        .lte('created_at', endDate);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate statistics from the returned data
    const totalChats = data.length;
    const totalTokens = data.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0);
    const totalCost = data.reduce((sum, chat) => sum + (parseFloat(chat.total_cost) || 0), 0);
    const avgCostPerChat = totalChats > 0 ? totalCost / totalChats : 0;
    const avgTokensPerChat = totalChats > 0 ? totalTokens / totalChats : 0;
    
    return {
        total_chats: totalChats,
        total_tokens: totalTokens,
        total_cost: totalCost,
        avg_cost_per_chat: avgCostPerChat,
        avg_tokens_per_chat: avgTokensPerChat
      };
    } catch (error) {
      throw error;
    }
  }

// Delete chat
const deleteChat = async (id) => {
  try {
    const { data, error } = await supabaseClient
      .from('chats')
      .delete()
      .eq('id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get recent chats across all agents (for admin dashboard)
const getRecent = async (limit = 10) => {
  try {
    // Get recent chats
    const { data: chats, error: chatsError } = await supabaseClient
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (chatsError) throw chatsError;
    
    // Fetch agent and client information for each chat
    const chatsWithDetails = await Promise.all(chats.map(async (chat) => {
      // Get agent info
      const { data: agent, error: agentError } = await supabaseClient
        .from('agents')
        .select('name')
        .eq('id', chat.agent_id)
        .single();
      
      // Get client info if available
      let clientName = null;
      let clientEmail = null;
      
      if (chat.client_id) {
        const { data: client, error: clientError } = await supabaseClient
          .from('leads')
          .select('name, email')
          .eq('id', chat.client_id)
          .single();
          
        if (!clientError && client) {
          clientName = client.name;
          clientEmail = client.email;
        }
      }
      
      return {
        ...chat,
        agent_name: agent?.name || null,
        client_name: clientName,
        client_email: clientEmail
      };
    }));
    
    return chatsWithDetails;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getById,
  addMessage,
  linkToLead,
  getByAgentId,
  getStatsByAgentId,
  deleteChat,
  getRecent
};