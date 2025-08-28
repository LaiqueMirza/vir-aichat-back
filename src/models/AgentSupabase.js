const { getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new agent
const create = async (name, description) => {
  try {
    const id = uuidv4();
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .insert({
        name,
        description,
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
const getById = async (agent_id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .select('*')
      .eq('agent_id', agent_id)
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
    
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .update(filteredUpdates)
      .eq('agent_id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all agents for a user
const getAllByUser = async () => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete an agent
const deleteAgent = async (agent_id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .delete()
      .eq('agent_id', agent_id)
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
    const { count: chatCount, error: chatError } = await getSupabaseClient()
      .from('chats')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id);
    
    if (chatError) throw chatError;
    
    // Get total lead count
    const { count: leadCount, error: leadError } = await getSupabaseClient()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id);
    
    if (leadError) throw leadError;
    
    // Get total file count
    const { count: fileCount, error: fileError } = await getSupabaseClient()
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id);
    
    if (fileError) throw fileError;
    
    // Get total token usage
    const { data: tokenData, error: tokenError } = await getSupabaseClient()
      .from('chats')
      .select('total_tokens')
      .eq('agent_id', id);
    
    if (tokenError) throw tokenError;
    
    const totalTokens = tokenData.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0);
    
    // Get total cost
    const { data: costData, error: costError } = await getSupabaseClient()
      .from('chats')
      .select('total_cost')
      .eq('agent_id', id);
    
    if (costError) throw costError;
    
    const totalCost = costData.reduce((sum, chat) => sum + (parseFloat(chat.total_cost) || 0), 0);
    
    return {
      totalChats: chatCount,
      totalLeads: leadCount,
      totalFiles: fileCount,
      totalTokens: totalTokens,
      totalCost: totalCost.toFixed(4)
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