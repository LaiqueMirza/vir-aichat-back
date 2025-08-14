const { Pool } = require('pg');

let pool = null;

// Initialize database pool only if DATABASE_URL is properly configured
function initializePool() {
  const databaseUrl = process.env.DATABASE_URL;
  console.log('🔍 DATABASE_URL debug:', {
    exists: !!databaseUrl,
    length: databaseUrl ? databaseUrl.length : 0,
    value: databaseUrl ? databaseUrl.substring(0, 50) + '...' : 'undefined'
  });
  
  if (!databaseUrl || databaseUrl === 'your_neon_postgresql_connection_string_here') {
    console.warn('⚠️ DATABASE_URL not configured - database features will be disabled');
    return null;
  }
  
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    return pool;
  } catch (error) {
    console.error('❌ Failed to initialize database pool:', error.message);
    return null;
  }
}

// Initialize the pool
pool = initializePool();

// Test database connection
const testConnection = async () => {
  try {
    if (!pool) {
      console.warn('⚠️ Skipping database connection test - database not configured');
      return;
    }
    
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error.message);
    throw error;
  }
};

// Initialize database tables
async function initializeTables() {
  try {
    if (!pool) {
      console.warn('⚠️ Skipping database table initialization - database not configured');
      return;
    }
    
    console.log('🔧 Initializing database tables...');
    
    // Create agents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        context TEXT,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'training')),
        total_chats INTEGER DEFAULT 0 CHECK (total_chats >= 0),
        total_leads INTEGER DEFAULT 0 CHECK (total_leads >= 0),
        document_count INTEGER DEFAULT 0 CHECK (document_count >= 0),
        total_cost DECIMAL(10, 6) DEFAULT 0 CHECK (total_cost >= 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      ) 
    `);
    
    // Create files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL UNIQUE,
        file_size INTEGER CHECK (file_size >= 0),
        file_type VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create leads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        user_id VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255) CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
        phone VARCHAR(50),
        company VARCHAR(255),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
        source_conversation_id VARCHAR(255),
        follow_up_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create chats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        client_id VARCHAR(255) NOT NULL,
        messages JSONB DEFAULT '[]'::jsonb NOT NULL,
        total_cost DECIMAL(10, 6) DEFAULT 0 CHECK (total_cost >= 0),
        total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for better performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_files_agent_id ON files(agent_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_chats_agent_id ON chats(agent_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_chats_client_id ON chats(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);`);
    
    console.log('✅ Database tables and indexes initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing tables:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  testConnection,
  initializeTables
};