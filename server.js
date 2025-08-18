const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables FIRST
dotenv.config();

// Import Supabase client instead of PostgreSQL
const { testConnection, initializeTables } = require('./src/config/supabase');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/', require('./src/routes/index'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    try {
      console.log('🔄 Testing Supabase connection...');
      const connectionSuccess = await testConnection();
      if (!connectionSuccess) {
        console.warn('⚠️ Database connection failed, but continuing startup');
      }
    } catch (dbError) {
      console.warn('⚠️ Database connection issue, but continuing startup:', dbError.message);
    }
    
    // Initialize database tables
    try {
      console.log('🔄 Initializing database tables...');
      await initializeTables();
    } catch (tableError) {
      console.warn('⚠️ Table initialization issue, but continuing startup:', tableError.message);
      console.log('\n📝 If tables are missing, you have two options:');
      console.log('1. Run the SQL file directly in Supabase SQL Editor (Recommended):');
      console.log('   - Open scripts/create-tables.sql');
      console.log('   - Copy and paste its contents into the Supabase SQL Editor');
      console.log('2. Or run the database setup script:');
      console.log('   node scripts/create-tables.js');
    }
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    //   console.log(`📊 Health check: http://localhost:${PORT}/health`);
    //   console.log(`🔗 API endpoints:`);
    //   console.log(`   - Agents: http://localhost:${PORT}/api/agents`);
    //   console.log(`   - Files: http://localhost:${PORT}/api/files`);
    //   console.log(`   - Chat: http://localhost:${PORT}/api/chat`);
    //   console.log(`   - Leads: http://localhost:${PORT}/api/leads`);
    //   console.log(`   - Analytics: http://localhost:${PORT}/api/analytics`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;