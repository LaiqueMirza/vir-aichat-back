const { getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new agent
const create = async (name, context) => {
  try {
    const id = uuidv4();
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .insert([{ agent_id: id, name, context }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all agents
const getAll = async () => {
  try {
    // Get all agents
    const { data: agents, error: agentsError } = await getSupabaseClient()
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (agentsError) throw agentsError;
    
    // For each agent, get file count, chat count, and lead count
    const agentsWithCounts = await Promise.all(agents.map(async (agent) => {
      // Get file count
      const { count: fileCount, error: fileError } = await getSupabaseClient()
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.agent_id);
        
      if (fileError) throw fileError;
      
      // Get chat count
      const { count: chatCount, error: chatError } = await getSupabaseClient()
        .from('chats')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.agent_id);
        
      if (chatError) throw chatError;
      
      // Get lead count
      const { count: leadCount, error: leadError } = await getSupabaseClient()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.agent_id);
        
      if (leadError) throw leadError;
      
      return {
        ...agent,
        file_count: fileCount,
        chat_count: chatCount,
        lead_count: leadCount
      };
    }));
    
    return agentsWithCounts;
  } catch (error) {
    throw error;
  }
}

// Get agent by ID
const getById = async (id) => {
  try {
    // Get agent by ID
    const { data: agent, error: agentError } = await getSupabaseClient()
      .from('agents')
      .select('*')
      .eq('agent_id', id)
      .single();
      
    if (agentError) throw agentError;
    if (!agent) return null;
    
    // Get file count
    const { count: fileCount, error: fileError } = await getSupabaseClient()
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id);
      
    if (fileError) throw fileError;
    
    // Get chat count
    const { count: chatCount, error: chatError } = await getSupabaseClient()
      .from('chats')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id);
      
    if (chatError) throw chatError;
    
    // Get lead count
    const { count: leadCount, error: leadError } = await getSupabaseClient()
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', id);
      
    if (leadError) throw leadError;
    
    return {
      ...agent,
      file_count: fileCount,
      chat_count: chatCount,
      lead_count: leadCount
    };
  } catch (error) {
    throw error;
  }
}

// Update agent
const update = async (id, name, context) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .update({ name, context })
      .eq('agent_id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete agent
const deleteAgent = async (id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('agents')
      .delete()
      .eq('agent_id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get agent files
const getFiles = async (agentId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('files')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get agent chats
const getChats = async (agentId) => {
  try {
    // Get chats for the agent
    const { data: chats, error: chatsError } = await getSupabaseClient()
      .from('chats')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
      
    if (chatsError) throw chatsError;
    
    // For each chat, get the client info
    const chatsWithClientInfo = await Promise.all(chats.map(async (chat) => {
      if (!chat.lead_id)
				return { ...chat, client_name: null, client_email: null };
      
      const { data: lead, error: leadError } = await getSupabaseClient()
				.from("leads")
				.select("name, email")
				.eq("id", chat.lead_id)
				.single();
        
      if (leadError && leadError.code !== 'PGRST116') throw leadError; // PGRST116 is 'not found'
      
      return {
        ...chat,
        client_name: lead?.name || null,
        client_email: lead?.email || null
      };
    }));
    
    return chatsWithClientInfo;
  } catch (error) {
    throw error;
  }
}

// Get agent leads
const getLeads = async (agentId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('leads')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get agent cost summary
const getCostSummary = async (agentId, startDate = null, endDate = null) => {
  try {
    let query = getSupabaseClient()
      .from('chats')
      .select('*')
      .eq('agent_id', agentId);
    
    if (startDate && endDate) {
      query = query
        .gte('created_at', startDate)
        .lte('created_at', endDate);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate summary statistics
    const totalChats = data.length;
    const totalTokens = data.reduce(
			(sum, chat) => sum + (chat.total_tokens || 0),
			0
		);
    const totalCost = data.reduce((sum, chat) => sum + (chat.cost_usd || 0), 0);
    const avgCostPerChat = totalChats > 0 ? totalCost / totalChats : 0;
    
    return {
      total_chats: totalChats,
      total_tokens: totalTokens,
      total_cost: totalCost,
      avg_cost_per_chat: avgCostPerChat
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getAll,
  getById,
  update,
  deleteAgent,
  getFiles,
  getChats,
  getLeads,
  getCostSummary
};