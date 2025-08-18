const { supabaseClient, uploadToStorage, deleteFromStorage } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Bucket name for agent files
const AGENT_FILES_BUCKET = 'agent-files';

// Create a new file record with Supabase Storage URL
const create = async (agentId, fileName, fileType, fileSize, fileBuffer, contentType, embeddingStatus = 'pending') => {
  try {
    const id = uuidv4();
    const filePath = `${agentId}/${id}-${fileName}`;
    
    // Upload file to Supabase Storage
    const storageResult = await uploadToStorage(
      AGENT_FILES_BUCKET,
      filePath,
      fileBuffer,
      contentType
    );
    
    // Create file record in database
    const { data, error } = await supabaseClient
      .from('files')
      .insert({
        id,
        agent_id: agentId,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        file_url: storageResult.publicUrl,
        storage_path: storageResult.path,
        embedding_status: embeddingStatus
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get file by ID
const getById = async (id) => {
  try {
    const { data, error } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Update file information
const update = async (id, updates) => {
  try {
    const allowedFields = ['file_name', 'file_type', 'file_size', 'file_url', 'embedding_status', 'chunk_count'];
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
      .from('files')
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

// Get all files for an agent
const getAllByAgent = async (agentId) => {
  try {
    const { data, error } = await supabaseClient
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

// Delete a file
const deleteFile = async (id) => {
  try {
    // Get file info first
    const { data: fileData, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
      
    if (fileError) throw fileError;
    
    // Delete from Supabase Storage if storage_path exists
    if (fileData.storage_path) {
      await deleteFromStorage(AGENT_FILES_BUCKET, fileData.storage_path);
    }
    
    // Delete from database
    const { data, error } = await supabaseClient
      .from('files')
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

// Update embedding status
const updateEmbeddingStatus = async (id, status, chunkCount = null) => {
  try {
    const updates = {
      embedding_status: status,
      updated_at: new Date().toISOString()
    };
    
    if (chunkCount !== null) {
      updates.chunk_count = chunkCount;
    }
    
    const { data, error } = await supabaseClient
      .from('files')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Get files with pending embeddings
const getPendingEmbeddings = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('files')
      .select('*')
      .eq('embedding_status', 'pending')
      .order('created_at', { ascending: true });
    
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
  getAllByAgent,
  deleteFile,
  updateEmbeddingStatus,
  getPendingEmbeddings
};