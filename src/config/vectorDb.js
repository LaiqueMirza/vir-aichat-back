const { createClient } = require('@supabase/supabase-js');

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
    console.log('✅ Supabase client initialized');
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
    } else {
      console.log('✅ Vector embeddings table ready');
    }
  } catch (err) {
    console.error('❌ Vector database initialization error:', err.message);
  }
};

// Store embeddings with metadata
const storeEmbedding = async (agentId, content, embedding, metadata = {}) => {
  if (!supabase) {
    console.warn('⚠️ Skipping embedding storage - Supabase not configured');
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('embeddings')
      .insert({
        agent_id: agentId,
        content: content,
        embedding: embedding,
        metadata: {
          ...metadata,
          created_at: new Date().toISOString()
        }
      });
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('❌ Error storing embedding:', err.message);
    throw err;
  }
};

// Search similar embeddings
const searchSimilarEmbeddings = async (agentId, queryEmbedding, limit = 5, threshold = 0.7) => {
  if (!supabase) {
    console.warn('⚠️ Skipping embedding search - Supabase not configured');
    return [];
  }
  
  try {
    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      agent_id: agentId,
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

module.exports = {
  supabase,
  initializeVectorTable,
  storeEmbedding,
  searchSimilarEmbeddings,
  deleteAgentEmbeddings
};