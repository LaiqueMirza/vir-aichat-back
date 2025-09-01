-- Add performance indexes to chat_logs table for message persistence
-- These indexes will optimize queries for chat history retrieval with pagination

-- Index on chat_id for filtering messages by chat
CREATE INDEX IF NOT EXISTS idx_chat_logs_chat_id ON chat_logs(chat_id);

-- Index on created_at for ordering messages chronologically
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);

-- Composite index on chat_id and created_at for efficient pagination
-- This is the most important index for our chat history queries
CREATE INDEX IF NOT EXISTS idx_chat_logs_chat_id_created_at ON chat_logs(chat_id, created_at DESC);

-- Index on role for filtering by message type (user/assistant)
CREATE INDEX IF NOT EXISTS idx_chat_logs_role ON chat_logs(role);

-- Additional indexes for chats table to optimize related queries
CREATE INDEX IF NOT EXISTS idx_chats_agent_id ON chats(agent_id);
CREATE INDEX IF NOT EXISTS idx_chats_lead_id ON chats(lead_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at);

-- Composite index for chats table for efficient agent-based queries
CREATE INDEX IF NOT EXISTS idx_chats_agent_id_created_at ON chats(agent_id, created_at DESC);

-- Index for leads table to optimize lead lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Performance analysis query to verify index usage
-- Run this after creating indexes to ensure they're being used:
-- EXPLAIN (ANALYZE, BUFFERS) 
-- SELECT * FROM chat_logs 
-- WHERE chat_id = 'your-chat-id' 
-- ORDER BY created_at DESC 
-- LIMIT 50 OFFSET 0;