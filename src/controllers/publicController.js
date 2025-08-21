const { supabaseClient } = require('../config/supabase');
const ragService = require('../services/ragService');
const embeddingsService = require('../services/embeddingsService');

// Health check endpoint
const healthCheck = async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: supabaseClient ? 'connected' : 'disabled',
          ai: 'checking...',
          vectorDb: 'checking...'
        }
      };
      
      // Check AI service
      try {
        const { gpt4oMini } = require('../config/openai');
        health.services.ai = gpt4oMini ? 'configured' : 'disabled';
      } catch (error) {
        health.services.ai = 'error';
      }
      
      // Check vector database
      try {
        const { supabase } = require('../config/vectorDb');
        health.services.vectorDb = supabase ? 'configured' : 'disabled';
      } catch (error) {
        health.services.vectorDb = 'error';
      }
      
      res.json(health);
    } catch (error) {
      console.error('❌ Health check error:', error.message);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
}

// Get system information
const getSystemInfo = async (req, res) => {
    try {
      const info = {
        name: 'Multi-tenant Chat Agent Backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        features: {
          database: !!supabaseClient,
          ai: false,
          vectorSearch: false,
          fileUpload: true
        },
        limits: {
          maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
          allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'pdf,txt,docx,md').split(','),
          uploadDir: process.env.UPLOAD_DIR || 'uploads'
        }
      };
      
      // Check AI availability
      try {
        const { gpt4o, gpt4oMini } = require('../config/openai');
        info.features.ai = !!(gpt4o || gpt4oMini);
      } catch (error) {
        info.features.ai = false;
      }
      
      // Check vector search availability
      try {
        const { supabase } = require('../config/vectorDb');
        info.features.vectorSearch = !!supabase;
      } catch (error) {
        info.features.vectorSearch = false;
      }
      
      res.json({
        success: true,
        data: info
      });
    } catch (error) {
      console.error('❌ Error getting system info:', error.message);
      res.status(500).json({
        error: 'Failed to get system information',
        message: error.message
      });
    }
}

// Public chat endpoint (for demo/testing)
const publicChat = async (req, res) => {
    try {
      const { message, agentId = 'demo' } = req.body;
      
      if (!message) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Message is required'
        });
      }
      
      console.log(`🌐 Public chat request: ${message.substring(0, 100)}...`);
      
      // Get relevant context (if available)
      let relevantContent = [];
      try {
        relevantContent = await embeddingsService.searchRelevantContent(agentId, message);
      } catch (error) {
        console.log('⚠️ Vector search not available for public chat');
      }
      
      // Generate AI response
      const aiResponse = await ragService.generateResponse({
        agentId,
        message,
        relevantContent,
        chatHistory: [] // No history for public chat
      });
      
      console.log(`✅ Public chat response generated (${aiResponse.tokensUsed} tokens, $${aiResponse.cost.toFixed(4)})`);
      
      res.json({
        success: true,
        data: {
          response: aiResponse.response,
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
          relevantSources: relevantContent.length,
          disclaimer: 'This is a public demo endpoint. Conversations are not stored.'
        }
      });
    } catch (error) {
      console.error('❌ Error in public chat:', error.message);
      res.status(500).json({
        error: 'Failed to process chat message',
        message: error.message
      });
    }
}

// Get public agent information
const getPublicAgentInfo = async (req, res) => {
    try {
      const { agentId } = req.params;
      
      if (!supabaseClient) {
        return res.json({
          success: true,
          data: {
            id: agentId,
            name: 'Demo Agent',
            description: 'This is a demo agent for testing purposes.',
            features: ['Basic chat', 'AI responses'],
            disclaimer: 'Database not configured - using demo data'
          }
        });
      }
      
      const { data: result, error } = await supabaseClient
        .from('agents')
        .select('id, name, context, created_at')
        .eq('id', agentId)
        .single();
      
      if (error || !result) {
        return res.status(404).json({
          error: 'Agent not found',
          message: 'The requested agent does not exist'
        });
      }
      
      const agent = result;
      
      // Get basic statistics
      const { data: chats, error: statsError } = await supabaseClient
				.from("chats")
				.select("lead_id")
				.eq("agent_id", agentId);
      
      if (statsError) {
        console.error('Error fetching chat statistics:', statsError);
      }
      
      // Calculate statistics
      const uniqueUserIds = new Set();
      chats?.forEach(chat => {
        if (chat.lead_id) uniqueUserIds.add(chat.lead_id);
      });
      
      const stats = {
        total_users: uniqueUserIds.size,
        total_messages: chats?.length || 0
      };
      
      res.json({
        success: true,
        data: {
          id: agent.id,
          name: agent.name,
          description: agent.context || 'No description available',
          createdAt: agent.created_at,
          stats: {
            totalUsers: stats.total_users || 0,
            totalMessages: stats.total_messages || 0
          },
          features: [
            'AI-powered responses',
            'Context-aware conversations',
            'Document knowledge base'
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error getting public agent info:', error.message);
      res.status(500).json({
        error: 'Failed to get agent information',
        message: error.message
      });
    }
}

// API documentation endpoint
const getApiDocs = async (req, res) => {
    try {
      const docs = {
				title: "Multi-tenant Chat Agent API",
				version: "1.0.0",
				description:
					"RESTful API for managing chat agents, conversations, files, and leads",
				baseUrl: `${req.protocol}://${req.get("host")}`,
				endpoints: {
					public: {
						"GET /health": "Health check",
						"GET /api/info": "System information",
						"POST /api/public/chat": "Public chat endpoint",
						"GET /api/public/agents/:agentId": "Public agent information",
						"GET /api/docs": "API documentation",
					},
					agents: {
						"GET /api/agents": "List all agents",
						"POST /api/agents": "Create new agent",
						"GET /api/agents/:id": "Get agent by ID",
						"PUT /api/agents/:id": "Update agent",
						"DELETE /api/agents/:id": "Delete agent",
					},
					chat: {
						"GET /api/agents/:agentId/chat": "Get chat history",
						"POST /api/agents/:agentId/chat": "Send message (requires lead_id)",
						"GET /api/agents/:agentId/chat/summary": "Get conversation summary",
						"DELETE /api/agents/:agentId/chat": "Clear chat history",
					},
					files: {
						"GET /api/agents/:agentId/files": "List agent files",
						"POST /api/agents/:agentId/files": "Upload file",
						"GET /api/agents/:agentId/files/:fileId": "Get file content",
						"DELETE /api/agents/:agentId/files/:fileId": "Delete file",
						"POST /api/agents/:agentId/files/:fileId/reprocess":
							"Reprocess file",
					},
					leads: {
						"GET /api/agents/:agentId/leads": "List agent leads",
						"POST /api/agents/:agentId/leads": "Create lead",
						"GET /api/agents/:agentId/leads/:leadId": "Get lead by ID",
						"PUT /api/agents/:agentId/leads/:leadId": "Update lead",
						"DELETE /api/agents/:agentId/leads/:leadId": "Delete lead",
						"POST /api/agents/:agentId/leads/extract":
							"Extract lead from conversation",
						"GET /api/agents/:agentId/leads/stats": "Get lead statistics",
					},
					analytics: {
						"GET /api/agents/:agentId/analytics": "Get agent analytics",
						"GET /api/agents/:agentId/analytics/costs": "Get cost breakdown",
						"GET /api/agents/:agentId/analytics/engagement":
							"Get user engagement",
						"GET /api/agents/:agentId/analytics/performance":
							"Get performance metrics",
					},
				},
				authentication: {
					note: "This API currently does not require authentication. In production, implement proper authentication and authorization.",
				},
				errorHandling: {
					format: {
						error: "Error type",
						message: "Human-readable error message",
					},
					codes: {
						400: "Bad Request - Invalid input",
						404: "Not Found - Resource does not exist",
						500: "Internal Server Error - Server error",
						503: "Service Unavailable - External service not configured",
					},
				},
			};
      
      res.json({
        success: true,
        data: docs
      });
    } catch (error) {
      console.error('❌ Error getting API docs:', error.message);
      res.status(500).json({
        error: 'Failed to get API documentation',
        message: error.message
      });
    }
}

module.exports = {
  healthCheck,
  getSystemInfo,
  publicChat,
  getPublicAgentInfo,
  getApiDocs
};