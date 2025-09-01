/**
 * Supabase Database Setup Script
 * 
 * This script creates the necessary tables in Supabase if they don't exist.
 * Run this script with: node scripts/create-tables.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// SQL statements for table creation
const createTablesSql = `
-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

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
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to agents
DROP POLICY IF EXISTS "Enable full access to all users" ON agents;
CREATE POLICY "Enable full access to all users" ON agents
  USING (true) WITH CHECK (true);

-- Create files table if it doesn't exist
CREATE TABLE IF NOT EXISTS files (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL UNIQUE,
  file_size INTEGER CHECK (file_size >= 0),
  file_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for files
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to files
DROP POLICY IF EXISTS "Enable full access to all users" ON files;
CREATE POLICY "Enable full access to all users" ON files
  USING (true) WITH CHECK (true);

-- Create files_vectors table if it doesn't exist
CREATE TABLE IF NOT EXISTS files_vectors (
  file_vector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for files_vectors
ALTER TABLE files_vectors ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to files_vectors
DROP POLICY IF EXISTS "Enable full access to all users" ON files_vectors;
CREATE POLICY "Enable full access to all users" ON files_vectors
  USING (true) WITH CHECK (true);

-- Create leads table if it doesn't exist
CREATE TABLE IF NOT EXISTS leads (
  lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  name VARCHAR(255),
  email VARCHAR(255) CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
  mobile VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to leads
DROP POLICY IF EXISTS "Enable full access to all users" ON leads;
CREATE POLICY "Enable full access to all users" ON leads
  USING (true) WITH CHECK (true);

-- Create chats table if it doesn't exist
CREATE TABLE IF NOT EXISTS chats (
  chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
  total_cost DECIMAL(10, 6) DEFAULT 0 CHECK (total_cost >= 0),
  total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for chats
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to chats
DROP POLICY IF EXISTS "Enable full access to all users" ON chats;
CREATE POLICY "Enable full access to all users" ON chats
  USING (true) WITH CHECK (true);

-- Create chat_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS chat_logs (
  chat_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security for chat_logs
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for full access to chat_logs
DROP POLICY IF EXISTS "Enable full access to all users" ON chat_logs;
CREATE POLICY "Enable full access to all users" ON chat_logs
  USING (true) WITH CHECK (true);

`;

// Function to execute SQL in Supabase
async function executeSql(sql) {
  try {
    // Using the Postgres extension to execute raw SQL
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      if (error.code === 'PGRST202') {
        console.error('Error: The exec_sql function does not exist in your Supabase project.');
      } else {
        console.error('Error executing SQL:', error);
      }
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception executing SQL:', error);
    return false;
  }
}

// Main function to create tables
async function createTables() {
  console.log('🔧 Connecting to Supabase...');
  
  try {
    // First, check if we can connect to Supabase
    const { data, error } = await supabase.from('agents').select('count', { count: 'exact', head: true });
    
    if (error && error.code !== '42P01') {
      // If error is not 'relation does not exist', then it's a connection issue
      console.error('❌ Failed to connect to Supabase:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Connected to Supabase successfully');
    
    // Check if the exec_sql function exists
    console.log('🔍 Checking if exec_sql function exists...');
    
    const { data: funcData, error: funcError } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
    
    if (funcError) {
      console.log('⚠️ The exec_sql function does not exist. Creating it now...');
      
      // Create the exec_sql function
      const createFunctionSql = `
      -- Enable the pgvector extension for vector operations
      CREATE EXTENSION IF NOT EXISTS vector;
      
      CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
      `;
      
      // We need to use the REST API directly since we can't create functions through the JS client
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql: createFunctionSql })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Failed to create exec_sql function:', errorData);
        console.log('\n⚠️ Please run the SQL in scripts/create-tables.sql in the Supabase SQL Editor to create all necessary tables and functions.');
        console.log('You can find this file at: scripts/create-tables.sql');
        process.exit(1);
      }
      
      console.log('✅ Created exec_sql function successfully');
    } else {
      console.log('✅ exec_sql function exists');
    }
    
    // Create tables
    console.log('🔧 Creating tables...');
    const success = await executeSql(createTablesSql);
    
    if (success) {
      console.log('✅ All tables created successfully');
    } else {
      console.error('❌ Failed to create tables');
      console.log('\n⚠️ Please run the following SQL in the Supabase SQL Editor:');
      console.log(createTablesSql);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
createTables().then(() => {
  console.log('🎉 Database setup completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});