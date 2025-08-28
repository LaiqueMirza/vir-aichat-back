const { getSupabaseClient } = require('../config/supabase');

async function addLeadIdToChats() {
  try {
    console.log('🔧 Adding lead_id column to chats table...');
    
    // Note: This migration should be performed through the Supabase dashboard or using migrations
    // as Supabase client doesn't directly support schema modifications through the JavaScript client
    console.log('ℹ️ For Supabase, schema modifications should be done through the Supabase dashboard');
    console.log('ℹ️ Please add the lead_id column to the chats table with the following properties:');
    console.log('   - Column name: lead_id');
    console.log('   - Data type: UUID');
    console.log('   - Foreign key reference: leads(id)');
    console.log('   - On delete: SET NULL');
    console.log('   - Create an index on this column');
    
    // Check if the column exists by trying to select it
    const { error } = await getSupabaseClient()
      .from('chats')
      .select('lead_id')
      .limit(1);
    
    if (error && error.message.includes('column "lead_id" does not exist')) {
      console.log('❌ lead_id column does not exist in chats table');
      console.log('ℹ️ Please add it through the Supabase dashboard');
    } else {
      console.log('✅ lead_id column already exists in chats table');
    }
    
  } catch (error) {
    console.error('❌ Error adding lead_id column:', error.message);
    throw error;
  }
}

module.exports = { addLeadIdToChats };