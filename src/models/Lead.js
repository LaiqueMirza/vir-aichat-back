const { supabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new lead
const create = async (agentId, name = null, phone = null, email = null, followUp = null) => {
  try {
    const id = uuidv4();
    const { data, error } = await supabaseClient
      .from('leads')
      .insert([{ 
        id, 
        agent_id: agentId, 
        name, 
        phone, 
        email, 
        follow_up: followUp, 
        status: 'New' 
      }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get lead by ID
const getById = async (id) => {
  try {
    // Get lead data
    const { data: lead, error: leadError } = await supabaseClient
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();
      
    if (leadError) throw leadError;
    if (!lead) return null;
    
    // Get agent name
    const { data: agent, error: agentError } = await supabaseClient
      .from('agents')
      .select('name')
      .eq('id', lead.agent_id)
      .single();
      
    // Combine lead and agent data
    return {
      ...lead,
      agent_name: agent?.name || null
    };
  } catch (error) {
    throw error;
  }
}

// Update lead information
const update = async (id, updates) => {
  try {
    const allowedFields = ['name', 'phone', 'email', 'follow_up', 'status'];
    const filteredUpdates = {};

    // Filter updates to only include allowed fields
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        // Convert snake_case database fields
        const dbField = key === 'follow_up' ? 'follow_up' : key;
        filteredUpdates[dbField] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Update the lead in Supabase
    const { data, error } = await supabaseClient
      .from('leads')
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

// Get all leads for an agent
const getByAgentId = async (agentId, status = null, limit = 50, offset = 0) => {
  try {
    // Build query
    let query = supabaseClient
      .from('leads')
      .select('*, agents!inner(name)')
      .eq('agent_id', agentId);
    
    // Add status filter if provided
    if (status) {
      query = query.eq('status', status);
    }
    
    // Add pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Execute query
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Get chat counts for each lead
    const leadsWithChatCounts = await Promise.all(data.map(async (lead) => {
      const { count, error: countError } = await supabaseClient
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', lead.id);
      
      return {
        ...lead,
        agent_name: lead.agents.name,
        chat_count: count || 0
      };
    }));
    
    return leadsWithChatCounts;
  } catch (error) {
    throw error;
  }
}

// Get all leads (for admin dashboard)
const getAll = async (status = null, limit = 50, offset = 0) => {
  try {
    // Build query
    let query = supabaseClient
      .from('leads')
      .select('*, agents!inner(name)');
    
    // Add status filter if provided
    if (status) {
      query = query.eq('status', status);
    }
    
    // Add pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Execute query
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Get chat counts for each lead
    const leadsWithChatCounts = await Promise.all(data.map(async (lead) => {
      const { count, error: countError } = await supabaseClient
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', lead.id);
      
      return {
        ...lead,
        agent_name: lead.agents.name,
        chat_count: count || 0
      };
    }));
    
    return leadsWithChatCounts;
  } catch (error) {
    throw error;
  }
}

// Get lead statistics for an agent
const getStatsByAgentId = async (agentId) => {
  try {
    // Get total leads count
    const { count: totalLeads, error: totalError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);
      
    if (totalError) throw totalError;
    
    // Get new leads count
    const { count: newLeads, error: newError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'New');
      
    // Get contacted leads count
    const { count: contactedLeads, error: contactedError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'Contacted');
      
    // Get follow-up leads count
    const { count: followupLeads, error: followupError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'Follow-up');
      
    // Get upcoming follow-ups
    const today = new Date().toISOString().split('T')[0];
    const { count: upcomingFollowups, error: upcomingError } = await supabaseClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .not('follow_up', 'is', null)
      .gte('follow_up', today);
      
    // Return statistics
    return {
      total_leads: totalLeads || 0,
      new_leads: newLeads || 0,
      contacted_leads: contactedLeads || 0,
      followup_leads: followupLeads || 0,
      upcoming_followups: upcomingFollowups || 0
    };
  } catch (error) {
    throw error;
  }
}

// Get leads with upcoming follow-ups
const getUpcomingFollowUps = async (agentId = null, days = 7) => {
  try {
    // Calculate date range
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);
    
    const todayStr = today.toISOString().split('T')[0];
    const futureDateStr = futureDate.toISOString().split('T')[0];
    
    // Build query
    let query = supabaseClient
      .from('leads')
      .select('*, agents!inner(name)')
      .not('follow_up', 'is', null)
      .gte('follow_up', todayStr)
      .lte('follow_up', futureDateStr);
    
    // Add agent filter if provided
    if (agentId) {
      query = query.eq('agent_id', agentId);
    }
    
    // Add sorting
    query = query.order('follow_up', { ascending: true });
    
    // Execute query
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Format the response to match the expected structure
    const formattedLeads = data.map(lead => ({
      ...lead,
      agent_name: lead.agents.name
    }));
    
    return formattedLeads;
  } catch (error) {
    throw error;
  }
}

// Delete lead
const deleteLead = async (id) => {
  try {
    const { data, error } = await supabaseClient
      .from('leads')
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

// Find lead by email and agent
const findByEmailAndAgent = async (email, agentId) => {
  try {
    const { data, error } = await supabaseClient
      .from('leads')
      .select('*')
      .eq('email', email)
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
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
  update,
  getByAgentId,
  getAll,
  getStatsByAgentId,
  getUpcomingFollowUps,
  deleteLead,
  findByEmailAndAgent
};