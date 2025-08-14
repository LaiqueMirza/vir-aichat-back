const { pool } = require('../config/db');
const costService = require('../services/costService');

// Get dashboard analytics for all agents
const getDashboardAnalytics = async (req, res) => {
    try {
      if (!pool) {
        // Return mock data when database is not configured
        return res.json({
          period: req.query.period || '30d',
          overview: {
            totalChats: 0,
            totalMessages: 0,
            uniqueUsers: 0,
            activeAgents: 0,
            totalTokens: 0,
            totalCost: 0,
            totalFiles: 0,
            totalFileSize: 0,
            totalLeads: 0
          },
          activity: [],
          topAgents: []
        });
      }

      const { period = '30d' } = req.query;
      
      // Calculate date range based on period
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }
      
      // Get overall chat statistics across all agents
      const chatStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_chats,
          SUM(jsonb_array_length(messages)) as total_messages,
          SUM(total_tokens) as total_tokens,
          SUM(total_cost) as total_cost,
          COUNT(DISTINCT client_id) as unique_users,
          COUNT(DISTINCT agent_id) as active_agents
        FROM chats 
        WHERE 1=1 ${dateFilter}
      `);
      
      // Get file statistics across all agents
      const fileStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_size
        FROM files 
        WHERE 1=1 ${dateFilter}
      `);
      
      // Get lead statistics across all agents
      const leadStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_leads,
          COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads
        FROM leads 
        WHERE 1=1 ${dateFilter}
      `);
      
      // Get daily activity across all agents
      const activityResult = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as chat_count,
          SUM(jsonb_array_length(messages)) as message_count,
          SUM(total_tokens) as tokens_used,
          SUM(total_cost) as cost
        FROM chats 
        WHERE 1=1 ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `);
      
      // Get top performing agents
      const topAgentsResult = await pool.query(`
        SELECT 
          a.id,
          a.name,
          COUNT(c.id) as chat_count,
          SUM(jsonb_array_length(c.messages)) as message_count,
          COUNT(DISTINCT c.client_id) as unique_users,
          SUM(c.total_tokens) as total_tokens,
          SUM(c.total_cost) as total_cost
        FROM agents a
        LEFT JOIN chats c ON a.id = c.agent_id ${dateFilter.replace('AND', 'AND c.')}
        GROUP BY a.id, a.name
        ORDER BY message_count DESC
        LIMIT 5
      `);
      
      const chatStats = chatStatsResult.rows[0];
      const fileStats = fileStatsResult.rows[0];
      const leadStats = leadStatsResult.rows[0];
      
      res.json({
        success: true,
        data: {
          period,
          overview: {
            totalChats: parseInt(chatStats.total_chats),
            totalMessages: parseInt(chatStats.total_messages || 0),
            uniqueUsers: parseInt(chatStats.unique_users),
            activeAgents: parseInt(chatStats.active_agents),
            totalTokens: parseInt(chatStats.total_tokens || 0),
            totalCost: parseFloat(chatStats.total_cost || 0),
            totalFiles: parseInt(fileStats.total_files),
            totalFileSize: parseInt(fileStats.total_size || 0),
            totalLeads: parseInt(leadStats.total_leads)
          },
          leads: {
            total: parseInt(leadStats.total_leads),
            new: parseInt(leadStats.new_leads),
            contacted: parseInt(leadStats.contacted_leads),
            qualified: parseInt(leadStats.qualified_leads),
            converted: parseInt(leadStats.converted_leads),
            conversionRate: leadStats.total_leads > 0 ? 
              (parseInt(leadStats.converted_leads) / parseInt(leadStats.total_leads) * 100).toFixed(2) : 0
          },
          dailyActivity: activityResult.rows.map(row => ({
            date: row.date,
            messageCount: parseInt(row.message_count),
            tokensUsed: parseInt(row.tokens_used || 0),
            cost: parseFloat(row.cost || 0)
          })),
          topAgents: topAgentsResult.rows.map(row => ({
            id: row.id,
            name: row.name,
            chatCount: parseInt(row.chat_count),
            messageCount: parseInt(row.message_count || 0),
            uniqueUsers: parseInt(row.unique_users),
            totalTokens: parseInt(row.total_tokens || 0),
            totalCost: parseFloat(row.total_cost || 0)
          }))
        }
      });
    } catch (error) {
      console.error('❌ Error fetching dashboard analytics:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch dashboard analytics',
        message: error.message 
      });
    }
}

// Get agent analytics overview
const getAgentAnalytics = async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          agentId: req.params.agentId,
          period: req.query.period || '30d',
          overview: {
            totalChats: 0,
            totalMessages: 0,
            uniqueUsers: 0,
            totalTokens: 0,
            totalCost: 0,
            avgResponseTime: 0,
            satisfactionScore: 0
          },
          activity: [],
          topTopics: [],
          userRetention: {
            returning: 0,
            new: 0
          }
        });
      }

      const { agentId } = req.params;
      const { period = '30d' } = req.query;
      
      // Calculate date range based on period
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }
      
      // Get chat statistics
      const chatStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN sender = 'user' THEN 1 END) as user_messages,
          COUNT(CASE WHEN sender = 'assistant' THEN 1 END) as ai_messages,
          SUM(tokens_used) as total_tokens,
          SUM(cost) as total_cost,
          COUNT(DISTINCT user_id) as unique_users
        FROM chats 
        WHERE agent_id = $1 ${dateFilter}
      `, [agentId]);
      
      // Get file statistics
      const fileStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_size
        FROM files 
        WHERE agent_id = $1 ${dateFilter}
      `, [agentId]);
      
      // Get lead statistics
      const leadStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_leads,
          COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads
        FROM leads 
        WHERE agent_id = $1 ${dateFilter}
      `, [agentId]);
      
      // Get daily activity for the period
      const activityResult = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as message_count,
          SUM(tokens_used) as tokens_used,
          SUM(cost) as cost
        FROM chats 
        WHERE agent_id = $1 ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [agentId]);
      
      const chatStats = chatStatsResult.rows[0];
      const fileStats = fileStatsResult.rows[0];
      const leadStats = leadStatsResult.rows[0];
      
      res.json({
        success: true,
        data: {
          period,
          overview: {
            totalMessages: parseInt(chatStats.total_messages),
            userMessages: parseInt(chatStats.user_messages),
            aiMessages: parseInt(chatStats.ai_messages),
            uniqueUsers: parseInt(chatStats.unique_users),
            totalTokens: parseInt(chatStats.total_tokens || 0),
            totalCost: parseFloat(chatStats.total_cost || 0),
            totalFiles: parseInt(fileStats.total_files),
            totalFileSize: parseInt(fileStats.total_size || 0),
            totalLeads: parseInt(leadStats.total_leads)
          },
          leads: {
            total: parseInt(leadStats.total_leads),
            new: parseInt(leadStats.new_leads),
            contacted: parseInt(leadStats.contacted_leads),
            qualified: parseInt(leadStats.qualified_leads),
            converted: parseInt(leadStats.converted_leads),
            conversionRate: leadStats.total_leads > 0 ? 
              (parseInt(leadStats.converted_leads) / parseInt(leadStats.total_leads) * 100).toFixed(2) : 0
          },
          dailyActivity: activityResult.rows.map(row => ({
            date: row.date,
            messageCount: parseInt(row.message_count),
            tokensUsed: parseInt(row.tokens_used || 0),
            cost: parseFloat(row.cost || 0)
          }))
        }
      });
    } catch (error) {
      console.error('❌ Error fetching agent analytics:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch analytics',
        message: error.message 
      });
    }
}

// Get cost breakdown
const getCostBreakdown = async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          agentId: req.params.agentId,
          period: req.query.period || '30d',
          totalCost: 0,
          breakdown: {
            gpt4: { cost: 0, tokens: 0, percentage: 0 },
            gpt35: { cost: 0, tokens: 0, percentage: 0 },
            embeddings: { cost: 0, tokens: 0, percentage: 0 }
          },
          dailyCosts: [],
          costTrends: {
            current: 0,
            previous: 0,
            change: 0
          }
        });
      }

      const { agentId } = req.params;
      const { period = '30d' } = req.query;
      
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }
      
      // Get cost breakdown by operation type
      const costBreakdownResult = await pool.query(`
        SELECT 
          'chat' as operation_type,
          SUM(cost) as total_cost,
          SUM(tokens_used) as total_tokens,
          COUNT(*) as operation_count
        FROM chats 
        WHERE agent_id = $1 AND sender = 'assistant' ${dateFilter}
        
        UNION ALL
        
        SELECT 
          'embeddings' as operation_type,
          0 as total_cost,
          0 as total_tokens,
          0 as operation_count
        WHERE FALSE
      `, [agentId]);
      
      // Get daily cost trends
      const dailyCostResult = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          SUM(cost) as daily_cost,
          SUM(tokens_used) as daily_tokens
        FROM chats 
        WHERE agent_id = $1 AND sender = 'assistant' ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, [agentId]);
      
      res.json({
        success: true,
        data: {
          period,
          breakdown: costBreakdownResult.rows.map(row => ({
            operationType: row.operation_type,
            totalCost: parseFloat(row.total_cost || 0),
            totalTokens: parseInt(row.total_tokens || 0),
            operationCount: parseInt(row.operation_count || 0)
          })),
          dailyTrends: dailyCostResult.rows.map(row => ({
            date: row.date,
            cost: parseFloat(row.daily_cost || 0),
            tokens: parseInt(row.daily_tokens || 0)
          }))
        }
      });
    } catch (error) {
      console.error('❌ Error fetching cost breakdown:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch cost breakdown',
        message: error.message 
      });
    }
}

// Get user engagement metrics
const getUserEngagement = async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          agentId: req.params.agentId,
          period: req.query.period || '30d',
          overview: {
            totalUsers: 0,
            activeUsers: 0,
            newUsers: 0,
            returningUsers: 0,
            avgSessionDuration: 0,
            avgMessagesPerSession: 0
          },
          engagement: {
            daily: [],
            hourly: [],
            userRetention: []
          },
          topUsers: []
        });
      }

      const { agentId } = req.params;
      const { period = '30d' } = req.query;
      
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }
      
      // Get user engagement statistics
      const engagementResult = await pool.query(`
        SELECT 
          user_id,
          COUNT(*) as message_count,
          MIN(created_at) as first_interaction,
          MAX(created_at) as last_interaction,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM chats 
        WHERE agent_id = $1 AND sender = 'user' ${dateFilter}
        GROUP BY user_id
        ORDER BY message_count DESC
        LIMIT 50
      `, [agentId]);
      
      // Get hourly activity patterns
      const hourlyActivityResult = await pool.query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as message_count
        FROM chats 
        WHERE agent_id = $1 ${dateFilter}
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, [agentId]);
      
      // Calculate engagement metrics
      const totalUsers = engagementResult.rows.length;
      const totalMessages = engagementResult.rows.reduce((sum, user) => sum + parseInt(user.message_count), 0);
      const avgMessagesPerUser = totalUsers > 0 ? (totalMessages / totalUsers).toFixed(2) : 0;
      
      res.json({
        success: true,
        data: {
          period,
          summary: {
            totalUsers,
            totalMessages,
            avgMessagesPerUser: parseFloat(avgMessagesPerUser)
          },
          topUsers: engagementResult.rows.slice(0, 10).map(user => ({
            userId: user.user_id,
            messageCount: parseInt(user.message_count),
            firstInteraction: user.first_interaction,
            lastInteraction: user.last_interaction,
            activeDays: parseInt(user.active_days)
          })),
          hourlyActivity: Array.from({ length: 24 }, (_, hour) => {
            const activity = hourlyActivityResult.rows.find(row => parseInt(row.hour) === hour);
            return {
              hour,
              messageCount: activity ? parseInt(activity.message_count) : 0
            };
          })
        }
      });
    } catch (error) {
      console.error('❌ Error fetching user engagement:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch user engagement metrics',
        message: error.message 
      });
    }
}

// Get performance metrics
const getPerformanceMetrics = async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          agentId: req.params.agentId,
          period: req.query.period || '30d',
          overview: {
            avgResponseTime: 0,
            successRate: 100,
            errorRate: 0,
            throughput: 0,
            uptime: 100
          },
          metrics: {
            responseTime: [],
            errorRates: [],
            throughput: []
          },
          alerts: []
        });
      }

      const { agentId } = req.params;
      const { period = '30d' } = req.query;
      
      let dateFilter = '';
      switch (period) {
        case '7d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
          break;
        case '30d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
          break;
        case '90d':
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '90 days'";
          break;
        default:
          dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
      }
      
      // Get response time metrics (simulated - would need actual response time tracking)
      const responseMetricsResult = await pool.query(`
        SELECT 
          AVG(tokens_used) as avg_tokens_per_response,
          MIN(tokens_used) as min_tokens,
          MAX(tokens_used) as max_tokens,
          COUNT(*) as total_responses
        FROM chats 
        WHERE agent_id = $1 AND sender = 'assistant' ${dateFilter}
      `, [agentId]);
      
      // Get conversation length distribution
      const conversationLengthResult = await pool.query(`
        SELECT 
          user_id,
          COUNT(*) as message_count
        FROM chats 
        WHERE agent_id = $1 ${dateFilter}
        GROUP BY user_id
      `, [agentId]);
      
      const responseMetrics = responseMetricsResult.rows[0];
      const conversationLengths = conversationLengthResult.rows.map(row => parseInt(row.message_count));
      
      // Calculate conversation length statistics
      const avgConversationLength = conversationLengths.length > 0 ? 
        (conversationLengths.reduce((sum, length) => sum + length, 0) / conversationLengths.length).toFixed(2) : 0;
      
      const shortConversations = conversationLengths.filter(length => length <= 3).length;
      const mediumConversations = conversationLengths.filter(length => length > 3 && length <= 10).length;
      const longConversations = conversationLengths.filter(length => length > 10).length;
      
      res.json({
        success: true,
        data: {
          period,
          responseMetrics: {
            totalResponses: parseInt(responseMetrics.total_responses || 0),
            avgTokensPerResponse: parseFloat(responseMetrics.avg_tokens_per_response || 0).toFixed(2),
            minTokens: parseInt(responseMetrics.min_tokens || 0),
            maxTokens: parseInt(responseMetrics.max_tokens || 0)
          },
          conversationMetrics: {
            totalConversations: conversationLengths.length,
            avgLength: parseFloat(avgConversationLength),
            distribution: {
              short: shortConversations, // 1-3 messages
              medium: mediumConversations, // 4-10 messages
              long: longConversations // 11+ messages
            }
          }
        }
      });
    } catch (error) {
      console.error('❌ Error fetching performance metrics:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch performance metrics',
        message: error.message 
      });
    }
}

module.exports = {
  getDashboardAnalytics,
  getAgentAnalytics,
  getCostBreakdown,
  getUserEngagement,
  getPerformanceMetrics
};