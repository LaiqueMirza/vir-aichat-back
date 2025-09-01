const { getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new lead
const create = async (agent_id, name = null, mobile = null, email = null) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('leads')
      .insert({
        agent_id: agent_id,
        name,
        mobile,
        email,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get lead by ID
const getById = async (
	id,
	select = `
        *,
        agents!leads_agent_id_fkey (name)
      `
) => {
	try {
		const { data, error } = await getSupabaseClient()
			.from("leads")
			.select(select)
			.eq("lead_id", id)
			.single();

		if (error) throw error;

		// Format the response to match the expected structure
		if (data) {
			return data;
		}

		return null;
	} catch (error) {
		throw error;
	}
};

// Update lead information
const update = async (id, updates) => {
  try {
    const allowedFields = [
			"name",
			"mobile",
			"email",
		];
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
      .from('leads')
      .update(filteredUpdates)
      .eq('lead_id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all leads for an agent
const getAllByAgent = async (agentId) => {
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

// Get leads by status
const getByStatus = async (agentId, status) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('leads')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', status)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get leads that need follow-up
const getFollowUps = async (agentId) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await getSupabaseClient()
      .from('leads')
      .select('*')
      .eq('agent_id', agentId)
      .lte('follow_up_date', today)
      .not('status', 'eq', 'converted')
      .not('status', 'eq', 'lost')
      .order('follow_up_date', { ascending: true });
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete a lead
const deleteLead = async (id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('leads')
      .delete()
      .eq('lead_id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Search leads
const search = async (agentId, query) => {
  try {
    const { data, error } = await getSupabaseClient()
			.from("leads")
			.select("*")
			.eq("agent_id", agentId)
			.or(
				`name.ilike.%${query}%,email.ilike.%${query}%,mobile.ilike.%${query}%,company.ilike.%${query}%`
			)
			.order("created_at", { ascending: false });
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get lead statistics
const getStats = async (agentId) => {
  try {
    // Get total count
    const { count: totalCount, error: countError } = await getSupabaseClient()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);
    
    if (countError) throw countError;
    
    // Get counts by status
    const statuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
    const statusCounts = {};
    
    for (const status of statuses) {
      const { count, error } = await getSupabaseClient()
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('status', status);
      
      if (error) throw error;
      statusCounts[status] = count;
    }
    
    return {
      total: totalCount,
      byStatus: statusCounts
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getById,
  update,
  getAllByAgent,
  getByStatus,
  getFollowUps,
  deleteLead,
  search,
  getStats
};