const { createClient } = require('@supabase/supabase-js');
const { getSupabaseClient } = require('./supabase');

// Supabase Vector Database configuration
let supabase = null;

// Initialize Supabase client only if credentials are provided
if (process.env.SUPABASE_URL && 
    process.env.SUPABASE_URL !== 'your_supabase_url_here' &&
    process.env.SUPABASE_SERVICE_ROLE_KEY && 
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your_supabase_service_role_key_here') {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (error) {
    console.warn('⚠️ Failed to initialize Supabase client:', error.message);
  }
} else {
  console.warn('⚠️ Supabase credentials not configured - vector search will be disabled');
}

// Initialize vector storage table
const initializeVectorTable = async () => {
  if (!supabase) {
    console.warn('⚠️ Skipping vector table initialization - Supabase not configured');
    return;
  }
  
  try {
    // Create embeddings table if it doesn't exist
    const { error } = await supabase.rpc('create_embeddings_table');
    
    if (error && !error.message.includes('already exists')) {
      console.error('❌ Error creating embeddings table:', error.message);
    }
  } catch (err) {
    console.error('❌ Vector database initialization error:', err.message);
  }
};

// Store embeddings with metadata
const storeEmbedding = async (fileId, content, embedding) => {
  
  try {
    const { data, error } = await getSupabaseClient()
      .from('files_vectors')
      .insert({
        file_id: fileId,
        content: content,
        embedding: embedding,
      });
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('❌ Error storing embedding:', err.message);
    throw err;
  }
};

// Search similar embeddings
const searchSimilarEmbeddings = async (agentId, queryEmbedding, limit = 3, threshold = 0.3) => {
  if (!supabase) {
    console.warn('⚠️ Skipping embedding search - Supabase not configured');
    return [];
  }
  // get all file_ids where agent_id = agentId
  const { data: file_ids, error: file_ids_error } = await getSupabaseClient()
    .from('files')
    .select('file_id')
    .eq('agent_id', agentId);
  
  if (file_ids_error) throw file_ids_error;
  try {
    const { data, error } = await supabase.rpc('match_embeddings', {
      file_ids: file_ids.map(file => file.file_id),
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit
    });
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('❌ Error searching embeddings:', err.message);
    throw err;
  }
};

// Delete embeddings for an agent
const deleteAgentEmbeddings = async (agentId) => {
  if (!supabase) {
    console.warn('⚠️ Skipping embedding deletion - Supabase not configured');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('embeddings')
      .delete()
      .eq('agent_id', agentId);
    
    if (error) throw error;
    console.log(`✅ Deleted embeddings for agent: ${agentId}`);
  } catch (err) {
    console.error('❌ Error deleting embeddings:', err.message);
    throw err;
  }
};

// Delete embeddings for a specific file
const deleteFileEmbeddings = async (fileId) => {
  try {
    const { error } = await getSupabaseClient()
      .from('files_vectors')
      .delete()
      .eq('file_id', fileId);
    
    if (error) throw error;
    console.log(`✅ Deleted embeddings for file: ${fileId}`);
  } catch (err) {
    console.error('❌ Error deleting file embeddings:', err.message);
    throw err;
  }
};

module.exports = {
  supabase,
  initializeVectorTable,
  storeEmbedding,
  searchSimilarEmbeddings,
  deleteAgentEmbeddings,
  deleteFileEmbeddings
};