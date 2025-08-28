const { getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Create a new file record
const create = async (agentId, fileName, fileUrl) => {
  try {
    const id = uuidv4();
    const { data, error } = await getSupabaseClient()
      .from('files')
      .insert([{ id, agent_id: agentId, file_name: fileName, file_url: fileUrl }])
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get all files for an agent
const getByAgentId = async (agentId) => {
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

// Get file by ID
const getById = async (id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('files')
      .select('*')
      .eq('file_id', id)
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete file
const deleteFile = async (id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('files')
      .delete()
      .eq('file_id', id)
      .select()
      .single();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Delete all files for an agent
const deleteByAgentId = async (agentId) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('files')
      .delete()
      .eq('agent_id', agentId)
      .select();
      
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get file count for an agent
const getCountByAgentId = async (agentId) => {
  try {
    const { count, error } = await getSupabaseClient()
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId);
      
    if (error) throw error;
    return count;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  create,
  getByAgentId,
  getById,
  deleteFile,
  deleteByAgentId,
  getCountByAgentId
};