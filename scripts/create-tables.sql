-- DROP TABLE IF EXISTS chat_logs CASCADE;
-- DROP TABLE IF EXISTS chats CASCADE;
-- DROP TABLE IF EXISTS leads CASCADE;
-- DROP TABLE IF EXISTS files_vectors CASCADE;
-- DROP TABLE IF EXISTS files CASCADE;
-- DROP TABLE IF EXISTS agents CASCADE;



-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$
-- BEGIN
--   EXECUTE sql;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create agents table if it doesn't exist
CREATE TABLE IF NOT EXISTS agents (
  agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'training')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for agents
-- ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to agents
-- DROP POLICY IF EXISTS "Enable full access to all users" ON agents;
-- CREATE POLICY "Enable full access to all users" ON agents
--   USING (true) WITH CHECK (true);

-- Create files table if it doesn't exist
CREATE TABLE IF NOT EXISTS files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(1000) NOT NULL,
  file_path VARCHAR(1000) NOT NULL UNIQUE,
  file_size INTEGER CHECK (file_size >= 0),
  file_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for files
-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- -- Create policy for full access to files
-- DROP POLICY IF EXISTS "Enable full access to all users" ON files;
-- CREATE POLICY "Enable full access to all users" ON files
--   USING (true) WITH CHECK (true);


-- Create files_vectors table if it doesn't exist
CREATE TABLE IF NOT EXISTS files_vectors (
  file_vector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for files_vectors
-- ALTER TABLE files_vectors ENABLE ROW LEVEL SECURITY;

-- -- Create policy for full access to files_vectors
-- DROP POLICY IF EXISTS "Enable full access to all users" ON files_vectors;
-- CREATE POLICY "Enable full access to all users" ON files_vectors
--   USING (true) WITH CHECK (true);
  
-- Create leads table if it doesn't exist
CREATE TABLE IF NOT EXISTS leads (
  lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  name VARCHAR(255),
  email VARCHAR(255) CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  mobile VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -- Enable Row Level Security for leads
-- ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- -- Create policy for full access to leads
-- DROP POLICY IF EXISTS "Enable full access to all users" ON leads;
-- CREATE POLICY "Enable full access to all users" ON leads
--   USING (true) WITH CHECK (true);

-- Create chats table if it doesn't exist
CREATE TABLE IF NOT EXISTS chats (
  chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
  total_cost DECIMAL(10, 8) DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for chats
-- ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- -- Create policy for full access to chats
-- DROP POLICY IF EXISTS "Enable full access to all users" ON chats;
-- CREATE POLICY "Enable full access to all users" ON chats
--   USING (true) WITH CHECK (true);

-- Create chat_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_logs (
  chat_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  total_tokens INTEGER DEFAULT 0,
  total_cost  DECIMAL(10, 8) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for chat_logs
-- ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- -- Create policy for full access to chat_logs
-- DROP POLICY IF EXISTS "Enable full access to all users" ON chat_logs;
-- CREATE POLICY "Enable full access to all users" ON chat_logs
--   USING (true) WITH CHECK (true);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
  file_ids UUID[],
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE(
  file_vector_id UUID,
  file_id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    files_vectors.file_vector_id,
    files_vectors.file_id,
    files_vectors.content,
    1 - (files_vectors.embedding <=> query_embedding) AS similarity
  FROM files_vectors
  WHERE files_vectors.file_id = ANY(file_ids)
    AND 1 - (files_vectors.embedding <=> query_embedding) > match_threshold
  ORDER BY files_vectors.embedding <=> query_embedding
  LIMIT match_count;
$$;