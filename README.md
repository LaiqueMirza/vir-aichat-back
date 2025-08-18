# Multi-Tenant AI Chat Agent System - Backend

A LangChain-powered multi-tenant AI chat agent system that allows companies to create custom AI agents with their own knowledge bases.

## 🚀 Features

- **Multi-tenant Architecture**: Each agent has isolated knowledge base and data
- **LangChain Integration**: RAG (Retrieval-Augmented Generation) with vector search
- **File Processing**: Support for PDF, DOCX, TXT, and HTML files
- **Lead Management**: Automatic lead capture and management
- **Cost Tracking**: Token usage and cost calculation per session
- **Analytics Dashboard**: Comprehensive analytics and reporting
- **Public Chat Interface**: Unique chat links for each agent

## 🛠 Tech Stack

- **Backend**: Node.js + Express
- **AI Framework**: LangChain JS
- **Database**: Supabase (500MB free tier)
- **Vector Database**: Supabase Vector (included in free tier)
- **File Storage**: Local storage with Multer
- **AI Models**: OpenAI GPT-4o and GPT-4o-mini

## 📋 Prerequisites

1. **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/)
2. **Supabase Account** - Free tier from [Supabase](https://supabase.com/)

## ⚡ Quick Setup

### 1. Clone and Install

```bash
cd vir-aichat-back
npm install
```

### 2. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Server Configuration
PORT=8000
NODE_ENV=development

# OpenAI API Configuration
OPENAI_API_KEY=sk-your-actual-openai-key

# Supabase Configuration (Free Tier)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vector Database Configuration
VECTOR_DB_TYPE=supabase
```

### 3. Database Setup

#### Supabase Database
1. Go to [Supabase](https://supabase.com/) and create a free account
2. Create a new project
3. Go to Settings > API and copy:
   - Project URL → `SUPABASE_URL`
   - Service Role Key → `SUPABASE_SERVICE_ROLE_KEY`
4. In the SQL Editor, run this to enable vector extension:

```sql
-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster similarity search
CREATE INDEX IF NOT EXISTS embeddings_agent_id_idx ON embeddings(agent_id);
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding VECTOR(1536),
  agent_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE(
  id BIGINT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    embeddings.id,
    embeddings.content,
    embeddings.metadata,
    1 - (embeddings.embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE embeddings.agent_id = match_embeddings.agent_id
    AND 1 - (embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 4. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:8000` and automatically:
- Test database connections
- Initialize required tables
- Display available API endpoints

## 📚 API Endpoints

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create new agent
- `GET /api/agents/:id` - Get agent details
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent

### Files
- `GET /api/files/:agentId` - List agent files
- `POST /api/files/:agentId/upload` - Upload file
- `DELETE /api/files/:id` - Delete file

### Chat
- `POST /api/chat/:agentId/message` - Send message
- `GET /api/chat/:agentId` - Get chat history
- `GET /api/chat/session/:chatId` - Get specific session

### Leads
- `GET /api/leads/:agentId` - List agent leads
- `POST /api/leads/:agentId` - Create lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead

### Analytics
- `GET /api/analytics/dashboard` - Dashboard stats
- `GET /api/analytics/agents` - Per-agent analytics
- `GET /api/analytics/costs` - Cost breakdown
- `GET /api/analytics/usage` - Usage statistics

### Public Chat
- `GET /chat/:agentId` - Public chat interface

## 🌐 Client Chat Access

Each agent gets a unique public chat link:
```
http://localhost:8000/chat/{agent-id}
```

Example: `http://localhost:8000/chat/123e4567-e89b-12d3-a456-426614174000`

## 💰 Cost Tracking

The system automatically tracks:
- Input/output tokens per message
- Model usage (GPT-4o vs GPT-4o-mini)
- Cost calculation based on OpenAI pricing
- Monthly cost summaries per agent

## 📁 File Processing

Supported file types:
- **PDF**: Extracted using pdf-parse
- **DOCX**: Extracted using mammoth
- **TXT**: Direct text processing
- **HTML**: Cleaned using cheerio

Files are automatically:
1. Parsed and chunked
2. Converted to embeddings
3. Stored in vector database
4. Tagged with agent_id for isolation

## 🔧 Development

### Project Structure
```
src/
├── config/          # Database and AI model configuration
├── models/          # Data models
├── routes/          # API route handlers
├── services/        # Business logic (RAG, embeddings, costs)
└── utils/           # Utility functions
```

### Key Services
- **RAG Service**: LangChain-powered retrieval and generation
- **Cost Service**: Token counting and cost calculation

## 🚀 Deployment

### Render (Free Tier)
1. Connect your GitHub repository to Render
2. Set environment variables in Render dashboard
3. Deploy with build command: `npm install`
4. Start command: `npm start`

### Environment Variables for Production
Make sure to set `NODE_ENV=production` and update database URLs for production.

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify Supabase credentials are correct
   - Check if Supabase project is active

2. **Vector Database Error**
   - Verify Supabase credentials
   - Ensure pgvector extension is enabled
   - Check if embeddings table exists

3. **OpenAI API Error**
   - Verify API key is valid
   - Check if you have sufficient credits

4. **File Upload Error**
   - Check file size limits
   - Verify file type is supported
   - Ensure uploads directory exists

### Logs
The server provides detailed logs for debugging:
- Database connection status
- API request/response logs
- Error messages with stack traces