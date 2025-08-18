const { supabaseClient } = require('../config/supabase');
const costService = require('../services/costService');

// Get dashboard analytics for all agents
const getDashboardAnalytics = async (req, res) => {
    try {
      if (!supabaseClient) {
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
      let daysAgo = 30;
      switch (period) {
        case '7d':
          daysAgo = 7;
          break;
        case '30d':
          daysAgo = 30;
          break;
        case '90d':
          daysAgo = 90;
          break;
        default:
          daysAgo = 30;
      }
      
      // Calculate the date from X days ago
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysAgo);
      
      // Get overall chat statistics across all agents
      const { data: chats, error: chatsError } = await supabaseClient
        .from('chats')
        .select('*')
        .gte('created_at', fromDate.toISOString());
      
      if (chatsError) throw chatsError;
      
      // Calculate chat statistics
      const totalChats = chats.length;
      const totalMessages = chats.reduce((sum, chat) => sum + (chat.messages ? chat.messages.length : 0), 0);
      const totalTokens = chats.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0);
      const totalCost = chats.reduce((sum, chat) => sum + (chat.total_cost || 0), 0);
      const uniqueUsers = new Set(chats.map(chat => chat.client_id)).size;
      const activeAgents = new Set(chats.map(chat => chat.agent_id)).size;
      
      // Get file statistics across all agents
      const { data: files, error: filesError } = await supabaseClient
        .from('files')
        .select('*')
        .gte('created_at', fromDate.toISOString());
      
      if (filesError) throw filesError;
      
      // Calculate file statistics
      const totalFiles = files.length;
      const totalFileSize = files.reduce((sum, file) => sum + (file.file_size || 0), 0);
      
      // Get lead statistics across all agents
      const { data: leads, error: leadsError } = await supabaseClient
        .from('leads')
        .select('*')
        .gte('created_at', fromDate.toISOString());
      
      if (leadsError) throw leadsError;
      
      // Calculate lead statistics
      const totalLeads = leads.length;
      const newLeads = leads.filter(lead => lead.status === 'new').length;
      const contactedLeads = leads.filter(lead => lead.status === 'contacted').length;
      const qualifiedLeads = leads.filter(lead => lead.status === 'qualified').length;
      const convertedLeads = leads.filter(lead => lead.status === 'converted').length;
      
      // Get daily activity across all agents
      // Group chats by date
      const chatsByDate = {};
      chats.forEach(chat => {
        const date = new Date(chat.created_at).toISOString().split('T')[0];
        if (!chatsByDate[date]) {
          chatsByDate[date] = [];
        }
        chatsByDate[date].push(chat);
      });
      
      // Calculate daily activity
      const activity = Object.keys(chatsByDate)
        .map(date => {
          const dailyChats = chatsByDate[date];
          return {
            date,
            chat_count: dailyChats.length,
            message_count: dailyChats.reduce((sum, chat) => sum + (chat.messages ? chat.messages.length : 0), 0),
            tokens_used: dailyChats.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0),
            cost: dailyChats.reduce((sum, chat) => sum + (chat.total_cost || 0), 0)
          };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
      
      // Get top performing agents
      // First, get all agents
      const { data: agents, error: agentsError } = await supabaseClient
        .from('agents')
        .select('*');
      
      if (agentsError) throw agentsError;
      
      // Calculate stats for each agent
      const agentStats = agents.map(agent => {
        const agentChats = chats.filter(chat => chat.agent_id === agent.id);
        return {
          id: agent.id,
          name: agent.name,
          chat_count: agentChats.length,
          message_count: agentChats.reduce((sum, chat) => sum + (chat.messages ? chat.messages.length : 0), 0),
          unique_users: new Set(agentChats.map(chat => chat.client_id)).size,
          total_tokens: agentChats.reduce((sum, chat) => sum + (chat.total_tokens || 0), 0),
          total_cost: agentChats.reduce((sum, chat) => sum + (chat.total_cost || 0), 0)
        };
      });
      
      // Sort by chat count and limit to top 10
      const topAgents = agentStats
        .sort((a, b) => b.chat_count - a.chat_count)
        .slice(0, 10);
      
      // Construct response
      res.json({
        success: true,
        data: {
          period,
          overview: {
            totalChats,
            totalMessages,
            uniqueUsers,
            activeAgents,
            totalTokens,
            totalCost,
            totalFiles,
            totalFileSize,
            totalLeads
          },
          leads: {
            total: totalLeads,
            new: newLeads,
            contacted: contactedLeads,
            qualified: qualifiedLeads,
            converted: convertedLeads,
            conversionRate: totalLeads > 0 ? 
              (convertedLeads / totalLeads * 100).toFixed(2) : 0
          },
          dailyActivity: activity.map(item => ({
            date: item.date,
            messageCount: item.message_count,
            tokensUsed: item.tokens_used,
            cost: item.cost
          })),
          topAgents: topAgents.map(agent => ({
            id: agent.id,
            name: agent.name,
            chatCount: agent.chat_count,
            messageCount: agent.message_count,
            uniqueUsers: agent.unique_users,
            totalTokens: agent.total_tokens,
            totalCost: agent.total_cost
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
      if (!supabaseClient) {
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
      let daysAgo = 30;
      switch (period) {
        case '7d':
          daysAgo = 7;
          break;
        case '30d':
          daysAgo = 30;
          break;
        case '90d':
          daysAgo = 90;
          break;
        default:
          daysAgo = 30;
      }
      
      // Calculate the date from X days ago
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysAgo);
      
      // Get chat statistics
      const { data: chats, error: chatsError } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .gte('created_at', fromDate.toISOString());
      
      if (chatsError) throw chatsError;
      
      // Get file statistics
      const { data: files, error: filesError } = await supabaseClient
        .from('files')
        .select('*')
        .eq('agent_id', agentId)
        .gte('created_at', fromDate.toISOString());
      
      if (filesError) throw filesError;
      
      // Get lead statistics
      const { data: leads, error: leadsError } = await supabaseClient
        .from('leads')
        .select('*')
        .eq('agent_id', agentId)
        .gte('created_at', fromDate.toISOString());
      
      if (leadsError) throw leadsError;
      
      // Calculate statistics
      const total_messages = chats.length;
      const user_messages = chats.filter(chat => chat.sender === 'user').length;
      const ai_messages = chats.filter(chat => chat.sender === 'assistant').length;
      const total_tokens = chats.reduce((sum, chat) => sum + (chat.tokens_used || 0), 0);
      const total_cost = chats.reduce((sum, chat) => sum + (chat.cost || 0), 0);
      const unique_users = new Set(chats.map(chat => chat.user_id)).size;
      
      const total_files = files.length;
      const total_size = files.reduce((sum, file) => sum + (file.file_size || 0), 0);
      
      const total_leads = leads.length;
      const new_leads = leads.filter(lead => lead.status === 'new').length;
      const contacted_leads = leads.filter(lead => lead.status === 'contacted').length;
      const qualified_leads = leads.filter(lead => lead.status === 'qualified').length;
      const converted_leads = leads.filter(lead => lead.status === 'converted').length;
      
      // Group chats by date for activity
      const chatsByDate = {};
      chats.forEach(chat => {
        const date = new Date(chat.created_at).toISOString().split('T')[0];
        if (!chatsByDate[date]) {
          chatsByDate[date] = [];
        }
        chatsByDate[date].push(chat);
      });
      
      // Calculate daily activity
      const activity = Object.keys(chatsByDate)
        .map(date => ({
          date,
          message_count: chatsByDate[date].length,
          tokens_used: chatsByDate[date].reduce((sum, chat) => sum + (chat.tokens_used || 0), 0),
          cost: chatsByDate[date].reduce((sum, chat) => sum + (chat.cost || 0), 0)
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
      
      res.json({
        success: true,
        data: {
          period,
          overview: {
            totalMessages: total_messages,
            userMessages: user_messages,
            aiMessages: ai_messages,
            uniqueUsers: unique_users,
            totalTokens: total_tokens,
            totalCost: total_cost,
            totalFiles: total_files,
            totalFileSize: total_size,
            totalLeads: total_leads
          },
          leads: {
            total: total_leads,
            new: new_leads,
            contacted: contacted_leads,
            qualified: qualified_leads,
            converted: converted_leads,
            conversionRate: total_leads > 0 ? 
              (converted_leads / total_leads * 100).toFixed(2) : 0
          },
          dailyActivity: activity.map(item => ({
            date: item.date,
            messageCount: item.message_count,
            tokensUsed: item.tokens_used,
            cost: item.cost
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
      if (!supabaseClient) {
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
      
      // Get chats for cost breakdown by operation type
      const { data: assistantChats, error: chatError } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .eq('sender', 'assistant')
        .gte('created_at', fromDate.toISOString());
      
      if (chatError) throw chatError;
      
      // Calculate cost breakdown
      const chatCost = assistantChats.reduce((sum, chat) => sum + (chat.cost || 0), 0);
      const chatTokens = assistantChats.reduce((sum, chat) => sum + (chat.tokens_used || 0), 0);
      const chatCount = assistantChats.length;
      
      const costBreakdown = [
        {
          operation_type: 'chat',
          total_cost: chatCost,
          total_tokens: chatTokens,
          operation_count: chatCount
        },
        {
          operation_type: 'embeddings',
          total_cost: 0,
          total_tokens: 0,
          operation_count: 0
        }
      ];
      
      // Group chats by date for daily cost trends
      const chatsByDate = {};
      assistantChats.forEach(chat => {
        const date = new Date(chat.created_at).toISOString().split('T')[0];
        if (!chatsByDate[date]) {
          chatsByDate[date] = [];
        }
        chatsByDate[date].push(chat);
      });
      
      // Calculate daily cost trends
      const dailyCosts = Object.keys(chatsByDate)
        .map(date => ({
          date,
          daily_cost: chatsByDate[date].reduce((sum, chat) => sum + (chat.cost || 0), 0),
          daily_tokens: chatsByDate[date].reduce((sum, chat) => sum + (chat.tokens_used || 0), 0)
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);
      
      res.json({
        success: true,
        data: {
          period,
          breakdown: costBreakdown.map(row => ({
            operationType: row.operation_type,
            totalCost: parseFloat(row.total_cost || 0),
            totalTokens: parseInt(row.total_tokens || 0),
            operationCount: parseInt(row.operation_count || 0)
          })),
          dailyTrends: dailyCosts.map(row => ({
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
      if (!supabaseClient) {
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
      
      // Calculate date range based on period
      let daysAgo = 30;
      switch (period) {
        case '7d':
          daysAgo = 7;
          break;
        case '30d':
          daysAgo = 30;
          break;
        case '90d':
          daysAgo = 90;
          break;
        default:
          daysAgo = 30;
      }
      
      // Calculate the date from X days ago
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysAgo);
      
      // Get user chats for engagement statistics
      const { data: userChats, error: chatError } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .eq('sender', 'user')
        .gte('created_at', fromDate.toISOString());
      
      if (chatError) throw chatError;
      
      // Group chats by user_id
      const chatsByUser = {};
      userChats.forEach(chat => {
        if (!chatsByUser[chat.user_id]) {
          chatsByUser[chat.user_id] = [];
        }
        chatsByUser[chat.user_id].push(chat);
      });
      
      // Calculate user engagement metrics
      const userEngagement = Object.keys(chatsByUser).map(userId => {
        const userMessages = chatsByUser[userId];
        const messageDates = userMessages.map(msg => new Date(msg.created_at).toISOString().split('T')[0]);
        const uniqueDates = new Set(messageDates);
        
        return {
          user_id: userId,
          message_count: userMessages.length,
          first_interaction: new Date(Math.min(...userMessages.map(msg => new Date(msg.created_at)))),
          last_interaction: new Date(Math.max(...userMessages.map(msg => new Date(msg.created_at)))),
          active_days: uniqueDates.size
        };
      }).sort((a, b) => b.message_count - a.message_count).slice(0, 50);
      
      // Get all chats for hourly activity patterns
      const { data: allChats, error: allChatsError } = await supabaseClient
        .from('chats')
        .select('created_at')
        .eq('agent_id', agentId)
        .gte('created_at', fromDate.toISOString());
      
      if (allChatsError) throw allChatsError;
      
      // Calculate hourly activity
      const hourlyActivity = {};
      for (let i = 0; i < 24; i++) {
        hourlyActivity[i] = 0;
      }
      
      allChats.forEach(chat => {
        const hour = new Date(chat.created_at).getHours();
        hourlyActivity[hour]++;
      });
      
      const hourlyActivityArray = Object.entries(hourlyActivity).map(([hour, count]) => ({
        hour: parseInt(hour),
        message_count: count
      }));
      
      // Calculate engagement metrics
      const totalUsers = userEngagement.length;
      const activeUsers = userEngagement.filter(user => 
        new Date(user.last_interaction) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;
      
      const totalMessages = userEngagement.reduce((sum, user) => sum + user.message_count, 0);
      const avgMessagesPerUser = totalUsers > 0 ? (totalMessages / totalUsers).toFixed(2) : 0;
      
      res.json({
        success: true,
        data: {
          period,
          summary: {
            totalUsers,
            activeUsers,
            totalMessages,
            avgMessagesPerUser: parseFloat(avgMessagesPerUser)
          },
          topUsers: userEngagement.slice(0, 10).map(user => ({
            userId: user.user_id,
            messageCount: user.message_count,
            firstInteraction: user.first_interaction,
            lastInteraction: user.last_interaction,
            activeDays: user.active_days
          })),
          hourlyActivity: hourlyActivityArray.map(hour => ({
            hour: hour.hour,
            messageCount: hour.message_count
          }))
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
      if (!supabaseClient) {
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
      
      // Calculate date range based on period
      let daysAgo = 30;
      switch (period) {
        case '7d':
          daysAgo = 7;
          break;
        case '30d':
          daysAgo = 30;
          break;
        case '90d':
          daysAgo = 90;
          break;
        default:
          daysAgo = 30;
      }
      
      // Calculate the date from X days ago
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysAgo);
      
      // Get assistant chats for response metrics
      const { data: assistantChats, error: chatError } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .eq('sender', 'assistant')
        .gte('created_at', fromDate.toISOString());
      
      if (chatError) throw chatError;
      
      // Get all chats for conversation length distribution
      const { data: allChats, error: allChatsError } = await supabaseClient
        .from('chats')
        .select('user_id')
        .eq('agent_id', agentId)
        .gte('created_at', fromDate.toISOString());
      
      if (allChatsError) throw allChatsError;
       
      // Calculate conversation length distribution
      const chatsByUser = {};
      allChats.forEach(chat => {
        if (!chatsByUser[chat.user_id]) {
          chatsByUser[chat.user_id] = 0;
        }
        chatsByUser[chat.user_id]++;
      });
       
      const conversationLengths = Object.values(chatsByUser);
      
      // Calculate conversation length statistics
      const avgConversationLength = conversationLengths.length > 0 ? 
        (conversationLengths.reduce((sum, length) => sum + length, 0) / conversationLengths.length).toFixed(2) : 0;
      
      const shortConversations = conversationLengths.filter(length => length <= 3).length;
      const mediumConversations = conversationLengths.filter(length => length > 3 && length <= 10).length;
      const longConversations = conversationLengths.filter(length => length > 10).length;
      
      // Calculate response metrics from assistantChats
      const responseTokens = assistantChats.map(chat => chat.tokens_used || 0).filter(tokens => tokens > 0);
      
      const totalResponses = assistantChats.length;
      const avgTokensPerResponse = responseTokens.length > 0 ?
        (responseTokens.reduce((sum, tokens) => sum + tokens, 0) / responseTokens.length).toFixed(2) : 0;
      const minTokens = responseTokens.length > 0 ? Math.min(...responseTokens) : 0;
      const maxTokens = responseTokens.length > 0 ? Math.max(...responseTokens) : 0;
      
      res.json({
        success: true,
        data: {
          period,
          responseMetrics: {
            totalResponses,
            avgTokensPerResponse,
            minTokens,
            maxTokens
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