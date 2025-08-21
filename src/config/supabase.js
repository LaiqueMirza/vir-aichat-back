const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;
let supabaseStorage = null;

// Initialize Supabase client only if credentials are properly configured
function initializeSupabase() {
  // Try to use SUPABASE_ANON_KEY first, fall back to SERVICE_ROLE_KEY if needed
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    console.log('🔄 Creating Supabase client...');
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    
    if (!client) {
      console.error('❌ Supabase client is null after initialization');
      return null;
    }
    
    console.log('✅ Supabase client initialized successfully');
    return client;
  } catch (error) {
    const errorMessage = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('❌ Failed to initialize Supabase client:', errorMessage);
    return null;
  }
}

// Initialize the client
supabaseClient = initializeSupabase();

// Re-export the client for use in other modules
const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = initializeSupabase();
  }
  return supabaseClient;
};

// Test Supabase connection
const testConnection = async () => {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.warn('⚠️ Skipping Supabase connection test - not configured');
      return false;
    }
    
    console.log('🔄 Attempting to connect to Supabase...');
    // Simple query to test connection
    const { data, error } = await client.from('agents').select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Supabase connection error:', error.message || JSON.stringify(error));
      throw new Error(`Supabase connection failed: ${error.message || JSON.stringify(error)}`);
    }
    console.log('✅ Supabase connected successfully');
    return true;
  } catch (error) {
    const errorMessage = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('❌ Supabase connection error:', errorMessage);
    // Don't throw the error, just return false to allow the server to continue
    return false;
  }
};

// Initialize database tables
async function initializeTables() {
  try {
    const client = getSupabaseClient();
    if (!client) {
      console.warn('⚠️ Skipping database table initialization - Supabase not configured');
      return;
    }
    
    console.log('🔧 Checking database tables in Supabase...');
    
    // Define required tables
    const requiredTables = ['agents', 'files', 'leads', 'chats', 'chat_logs'];
    let missingTables = [];
    
    // Check each table
    for (const table of requiredTables) {
      try {
        console.log(`🔄 Checking ${table} table...`);
        const { data, error } = await client
          .from(table)
          .select('count', { count: 'exact', head: true });
        
        if (error && error.code === '42P01') {
          console.warn(`⚠️ Table ${table} does not exist.`);
          missingTables.push(table);
        } else if (error) {
          console.error(`❌ Error checking ${table} table:`, error.message || JSON.stringify(error));
        } else {
          console.log(`✅ Table ${table} exists`);
        }
      } catch (tableError) {
        console.error(`❌ Exception checking ${table} table:`, tableError.message || JSON.stringify(tableError));
      }
    }
    
    // Provide guidance if tables are missing
    if (missingTables.length > 0) {
      console.warn('⚠️ Some required tables are missing. Please create all required tables using the SQL in scripts/create-tables.sql');
    }
    
    console.log('✅ Database tables check completed');
  } catch (error) {
    const errorMessage = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    console.error('❌ Error checking tables in Supabase:', errorMessage);
    // Don't throw the error, just log it
    console.log('⚠️ Continuing despite database initialization issues');
  }
}

// Get Supabase Storage instance
const getSupabaseStorage = () => {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('⚠️ Supabase client not available - storage features will be disabled');
    return null;
  }
  return client.storage;
};

// Upload file to Supabase Storage
const uploadToStorage = async (bucketName, filePath, fileBuffer, contentType) => {
  try {
    const storage = getSupabaseStorage();
    if (!storage) {
      throw new Error('Supabase Storage not available');
    }
    
    // // Check if bucket exists, create if not
    // const { data: buckets, error: bucketsError } = await storage.listBuckets();
    // if (bucketsError) {
    //   console.error('❌ Error listing buckets:', bucketsError.message);
    //   throw bucketsError;
    // }
    
    // const bucketExists = buckets.some(bucket => bucket.name === bucketName);
    
    // if (!bucketExists) {
    //   console.log(`🔄 Creating bucket: ${bucketName}`);
    //   const { error: createError } = await storage.createBucket(bucketName, {
    //     public: false,
    //     fileSizeLimit: 10485760 // 10MB
    //   });
      
    //   if (createError) {
    //     console.error('❌ Error creating bucket:', createError.message);
    //     throw createError;
    //   }
      
      // Set up RLS policies for the bucket
    //    const { error: policyError } = await storage.from(bucketName).createPolicy(
    //      'Enable access to agent files',
    //      {
    //        definition: true,
    //        check: true,
    //        allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
    //      }
    //    );
       
    //    if (policyError) {
    //      console.error('❌ Error setting bucket policy:', policyError.message);
    //      throw policyError;
    //    }
    // }
    
    // Upload file
     const { data, error } = await storage
       .from(bucketName)
       .upload(filePath, fileBuffer, {
         contentType,
         upsert: true
       });
     
     if (error) throw error;
     
     // Get public URL
     const { data: urlData } = storage
       .from(bucketName)
       .getPublicUrl(filePath);
    
    return {
      path: data.path,
      publicUrl: urlData.publicUrl
    };
  } catch (error) {
    console.error('❌ Error uploading to Supabase Storage:', error.message);
    throw error;
  }
};

// Delete file from Supabase Storage
const deleteFromStorage = async (bucketName, filePath) => {
  try {
    const storage = getSupabaseStorage();
    if (!storage) {
      throw new Error('Supabase Storage not available');
    }
    
    const { error } = await storage
      .from(bucketName)
      .remove([filePath]);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('❌ Error deleting from Supabase Storage:', error.message);
    throw error;
  }
};

module.exports = {
  supabaseClient: getSupabaseClient,
  getSupabaseClient,
  getSupabaseStorage,
  uploadToStorage,
  deleteFromStorage,
  testConnection,
  initializeTables
};