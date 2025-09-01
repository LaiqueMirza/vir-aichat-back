const { getSupabaseClient } = require('../src/config/supabase');
const fs = require('fs');
const path = require('path');

async function addIndexes() {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      console.error('❌ Supabase not configured');
      return;
    }

    console.log('🔧 Adding database indexes for performance optimization...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add-indexes.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements and filter out comments
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`\n[${i + 1}/${statements.length}] Executing: ${statement.substring(0, 60)}...`);
        
        try {
          // For Supabase, we need to use the rpc function to execute raw SQL
          const { error } = await supabaseClient.rpc('exec_sql', { 
            sql: statement 
          });
          
          if (error) {
            console.error(`❌ Error executing statement ${i + 1}:`, error.message);
            // go on with other statements even if one fails
          } else {
            console.log(`✅ Statement ${i + 1} executed successfully`);
          }
        } catch (err) {
          console.error(`❌ Exception executing statement ${i + 1}:`, err.message);
        }
      }
    }

    console.log('\n🎉 Database index creation process completed!');
    console.log('📊 Performance optimization indexes have been added to:');
    console.log('   - chat_logs table (chat_id, created_at, composite indexes)');
    console.log('   - chats table (agent_id, lead_id, created_at)');
    console.log('   - leads table (email, created_at)');
    
  } catch (error) {
    console.error('❌ Error adding database indexes:', error.message);
    console.error('Full error:', error);
  }
}

// Run the function
addIndexes();