const { uploadToStorage, deleteFromStorage, getSupabaseStorage, getSupabaseClient } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Bucket name for agent files
const AGENT_FILES_BUCKET = 'agent-files';

// Ensure bucket exists and has correct permissions
const initBucket = async () => {
  try {
    // Check if bucket exists
    const { data: buckets, error: bucketsError } = await getSupabaseStorage().listBuckets();
    if (bucketsError) throw bucketsError;

    const bucketExists = buckets.some(bucket => bucket.name === AGENT_FILES_BUCKET);
    if (!bucketExists) {
      const { error: createError } = await getSupabaseStorage().createBucket(AGENT_FILES_BUCKET, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      });
      if (createError) throw createError;
      console.log(`✅ Created storage bucket: ${AGENT_FILES_BUCKET}`);
    }
  } catch (error) {
    console.error('❌ Error initializing storage bucket:', error.message);
    // Don't throw error if bucket already exists
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }
};

// Create a new file record with Supabase Storage URL
const create = async (agentId, fileName, fileType, fileSize, fileBuffer, contentType) => {
  try {
    const file_id = uuidv4();
    const filePath = `${agentId}/${file_id}-${fileName}`;
    
    // Upload file to Supabase Storage
    const storageResult = await uploadToStorage(
      AGENT_FILES_BUCKET,
      filePath,
      fileBuffer,
      contentType
    );
    
    // Create file record in database
    const { data, error } = await getSupabaseClient()
      .from("files")
			.insert({
				agent_id: agentId,
				file_name: fileName,
				file_type: fileType,
				file_size: fileSize,
				file_url: storageResult.publicUrl,
				file_path: storageResult.path,
			})
			.select()
			.single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Create multiple file records with Supabase Storage URLs
const createBatch = async (files) => {
  try {
    const results = [];
    
    for (const file of files) {
      const { agentId, fileName, fileType, fileSize, fileBuffer, contentType } = file;
      const result = await create(agentId, fileName, fileType, fileSize, fileBuffer, contentType);
      results.push(result);
    }
    
    return results;
  } catch (error) {
    throw error;
  }
}

// Get file by ID
const getById = async (file_id) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from('files')
      .select('*')
      .eq('file_id', file_id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Update file information
const update = async (file_id, updates) => {
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
    
    const { data, error } = await getSupabaseClient()
      .from('files')
      .update(filteredUpdates)
      .eq('file_id', file_id)
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

// Delete a file
const deleteFile = async (file_id) => {
  try {
    // Get file info first
    const { data: fileData, error: fileError } = await getSupabaseClient()
      .from('files')
      .select('*')
      .eq('file_id', file_id)
      .single();
      
    if (fileError) throw fileError;
    
    // Delete from Supabase Storage if storage_path exists
    if (fileData.storage_path) {
      await deleteFromStorage(AGENT_FILES_BUCKET, fileData.storage_path);
    }
    
    // Delete from database
    const { data, error } = await getSupabaseClient()
      .from('files')
      .delete()
      .eq('file_id', file_id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    throw error;
  }
}

// Update embedding status
const updateEmbeddingStatus = async (file_id, status, chunkCount = null) => {
  try {
    const updates = {
      embedding_status: status,
      updated_at: new Date().toISOString()
    };
    
    if (chunkCount !== null) {
      updates.chunk_count = chunkCount;
    }
    
    const { data, error } = await getSupabaseClient()
      .from('files')
      .update(updates)
      .eq('file_id', file_id)
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
    const { data, error } = await getSupabaseClient()
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
  createBatch,
  getById,
  update,
  getAllByAgent,
  deleteFile,
  updateEmbeddingStatus,
  getPendingEmbeddings
};