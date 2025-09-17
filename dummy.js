 
    // Create agents table
    await supabase.query(`
        CREATE TABLE IF NOT EXISTS agents (
          agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'training')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        ) 
      `);
      
      // Create files table
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS files (
          file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL UNIQUE,
          file_size INTEGER CHECK (file_size >= 0),
          file_type VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create files vector table
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS files_vectors (
          file_vector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          content VARCHAR(255) NOT NULL,
          embedding VECTOR(1536) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create leads table
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS leads (
          lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          name VARCHAR(255),
          email VARCHAR(255) CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
          mobile VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create chats table
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS chats (
          chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
          lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
          total_cost DECIMAL(10, 6) DEFAULT 0 CHECK (total_cost >= 0),
          total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create chat logs table
      await supabase.query(`
        CREATE TABLE IF NOT EXISTS chat_logs (
          chat_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
          total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      













      