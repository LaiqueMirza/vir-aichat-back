const { supabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new agent
const create = async (name, description, systemPrompt, welcomeMessage, userId) => {
  try {
    const id = uuidv4();
    const { data, error } = await supabaseClient
      .from('agents')
      .insert({
        id,
        name,
        description,
        system_prompt: systemPrompt,
        welcome_message: welcomeMessage,
        user_id: userId
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get agent by ID
const getById = async (id) => {
  try {
    const { data, error } = await supabaseClient
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Update agent information
const update = async (id, updates) => {
  try {
    const allowedFields = ['name', 'description', 'system_prompt', 'welcome_message', 'avatar_url'];
    const filteredUpdates = {};
    
    // Only include allowed fields in the update
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }
    
    // Add updated_at timestamp
    filteredUpdates.updated_at = new Date().toISOString();
    
    const { data, error } = await supabaseClient
      .from('agents')
      .update(filteredUpdates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all agents for a user
const getAllByUser = async (userId) => {
  try {
    const { data, error } = await supabaseClient
      .from('agents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete an agent
const deleteAgent = async (id) => {
  try {
    const { data, error } = await supabaseClient
      .from('agents')
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

// Get agent statistics
const getStats = async (id) => {
  try {
    // Get total chat count
    const { count: chatCount, error: chatError } = await supabaseClient
      .from('chats')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id);
    
    if (chatError) throw chatError;
    
    // Get total lead count
    const { count: leadCount, error: leadError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id);
    
    if (leadError) throw leadError;
    
    // Get total token usage
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('chats')
      .select('total_tokens')
      .eq('agent_id', id);
    
    if (tokenError) throw tokenError;
    
    const totalTokens = tokenData.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0);
    
    // Get total cost
    const { data: costData, error: costError } = await supabaseClient
      .from('chats')
      .select('total_cost')
      .eq('agent_id', id);
    
    if (costError) throw costError;
    
    const totalCost = costData.reduce((sum, chat) => sum + (parseFloat(chat.total_cost) || 0), 0);
    
    return {
      chats: chatCount,
      leads: leadCount,
      tokens: totalTokens,
      cost: totalCost.toFixed(4)
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getById,
  update,
  getAllByUser,
  deleteAgent,
  getStats
};