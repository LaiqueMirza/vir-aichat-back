const { pool } = require('../config/db');

// Calculate and store cost for a chat session
const calculateSessionCost = async (chatId, tokenUsage, modelUsed) => {
    try {
      const { inputTokens, outputTokens } = tokenUsage;
      
      // Get cost rates from environment or use defaults
      const costs = this.getCostRates();
      const modelCosts = costs[modelUsed] || costs['gpt-4o-mini'];
      
      const inputCost = (inputTokens / 1000) * modelCosts.input;
      const outputCost = (outputTokens / 1000) * modelCosts.output;
      const totalCost = inputCost + outputCost;
      
      return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCost,
        outputCost,
        totalCost,
        modelUsed
      };
    } catch (error) {
      console.error('❌ Error calculating session cost:', error.message);
      throw error;
    }
}

// Get cost rates for different models
const getCostRates = () => {
    return {
      'gpt-4o': {
        input: parseFloat(process.env.GPT4O_INPUT_COST) || 0.0025,
        output: parseFloat(process.env.GPT4O_OUTPUT_COST) || 0.01
      },
      'gpt-4o-mini': {
        input: parseFloat(process.env.GPT4O_MINI_INPUT_COST) || 0.00015,
        output: parseFloat(process.env.GPT4O_MINI_OUTPUT_COST) || 0.0006
      },
      'text-embedding-3-small': {
        input: parseFloat(process.env.EMBEDDING_COST) || 0.00002,
        output: 0
      }
    };
}

// Get cost summary for an agent
const getAgentCostSummary = async (agentId, startDate = null, endDate = null) => {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          COUNT(*) as total_sessions,
          SUM(token_count) as total_tokens,
          SUM(cost_usd) as total_cost,
          AVG(cost_usd) as avg_cost_per_session,
          AVG(token_count) as avg_tokens_per_session,
          MIN(cost_usd) as min_session_cost,
          MAX(cost_usd) as max_session_cost,
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as daily_sessions,
          SUM(cost_usd) as daily_cost
        FROM chats 
        WHERE agent_id = $1
      `;
      const params = [agentId];

      if (startDate && endDate) {
        query += ` AND created_at BETWEEN $2 AND $3`;
        params.push(startDate, endDate);
      }

      query += ` GROUP BY DATE_TRUNC('day', created_at) ORDER BY date DESC`;

      const result = await client.query(query, params);
      
      // Calculate totals
      const totals = result.rows.reduce((acc, row) => ({
        totalSessions: acc.totalSessions + parseInt(row.daily_sessions),
        totalTokens: acc.totalTokens + parseInt(row.total_tokens || 0),
        totalCost: acc.totalCost + parseFloat(row.daily_cost || 0)
      }), { totalSessions: 0, totalTokens: 0, totalCost: 0 });

      return {
        summary: {
          ...totals,
          avgCostPerSession: totals.totalSessions > 0 ? totals.totalCost / totals.totalSessions : 0,
          avgTokensPerSession: totals.totalSessions > 0 ? totals.totalTokens / totals.totalSessions : 0
        },
        dailyBreakdown: result.rows.map(row => ({
          date: row.date,
          sessions: parseInt(row.daily_sessions),
          tokens: parseInt(row.total_tokens || 0),
          cost: parseFloat(row.daily_cost || 0)
        }))
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
}

// Get cost summary for all agents
const getAllAgentsCostSummary = async (startDate = null, endDate = null) => {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          a.id as agent_id,
          a.name as agent_name,
          COUNT(c.id) as total_sessions,
          COALESCE(SUM(c.token_count), 0) as total_tokens,
          COALESCE(SUM(c.cost_usd), 0) as total_cost,
          COALESCE(AVG(c.cost_usd), 0) as avg_cost_per_session,
          COALESCE(AVG(c.token_count), 0) as avg_tokens_per_session
        FROM agents a
        LEFT JOIN chats c ON a.id = c.agent_id
      `;
      const params = [];

      if (startDate && endDate) {
        query += ` AND c.created_at BETWEEN $1 AND $2`;
        params.push(startDate, endDate);
      }

      query += ` GROUP BY a.id, a.name ORDER BY total_cost DESC`;

      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        agentId: row.agent_id,
        agentName: row.agent_name,
        totalSessions: parseInt(row.total_sessions),
        totalTokens: parseInt(row.total_tokens),
        totalCost: parseFloat(row.total_cost),
        avgCostPerSession: parseFloat(row.avg_cost_per_session),
        avgTokensPerSession: parseFloat(row.avg_tokens_per_session)
      }));
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
}

// Get monthly cost trends
const getMonthlyCostTrends = async (agentId = null, months = 12) => {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as sessions,
          SUM(token_count) as tokens,
          SUM(cost_usd) as cost
        FROM chats
        WHERE created_at >= CURRENT_DATE - INTERVAL '${months} months'
      `;
      const params = [];

      if (agentId) {
        query += ` AND agent_id = $1`;
        params.push(agentId);
      }

      query += ` GROUP BY DATE_TRUNC('month', created_at) ORDER BY month DESC`;

      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        month: row.month,
        sessions: parseInt(row.sessions),
        tokens: parseInt(row.tokens || 0),
        cost: parseFloat(row.cost || 0)
      }));
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

// Get model usage breakdown
const getModelUsageBreakdown = async (agentId = null, startDate = null, endDate = null) => {
    // This would require storing model information in the database
    // For now, return estimated breakdown based on cost patterns
    try {
      const costSummary = agentId 
        ? await getAgentCostSummary(agentId, startDate, endDate)
        : await getAllAgentsCostSummary(startDate, endDate);

      // Estimate model usage based on cost patterns
      // This is a simplified estimation - in production, you'd store actual model usage
      const totalCost = Array.isArray(costSummary) 
        ? costSummary.reduce((sum, agent) => sum + agent.totalCost, 0)
        : costSummary.summary.totalCost;

      return {
        'gpt-4o-mini': {
          estimatedUsage: '85%',
          estimatedCost: totalCost * 0.85,
          description: 'Most conversations use the efficient mini model'
        },
        'gpt-4o': {
          estimatedUsage: '10%',
          estimatedCost: totalCost * 0.10,
          description: 'Complex queries requiring advanced reasoning'
        },
        'text-embedding-3-small': {
          estimatedUsage: '5%',
          estimatedCost: totalCost * 0.05,
          description: 'Document processing and search embeddings'
        }
      };
    } catch (error) {
      console.error('❌ Error getting model usage breakdown:', error.message);
      throw error;
    }
  }

// Estimate future costs based on usage patterns
const estimateFutureCosts = async (agentId = null, days = 30) => {
    try {
      const trends = await getMonthlyCostTrends(agentId, 3); // Last 3 months
      
      if (trends.length === 0) {
        return {
          estimatedDailyCost: 0,
          estimatedMonthlyCost: 0,
          confidence: 'low',
          message: 'Insufficient data for estimation'
        };
      }

      // Calculate average daily cost from recent trends
      const recentMonth = trends[0];
      const daysInMonth = new Date(recentMonth.month.getFullYear(), recentMonth.month.getMonth() + 1, 0).getDate();
      const avgDailyCost = recentMonth.cost / daysInMonth;

      // Calculate growth rate if we have multiple months
      let growthRate = 0;
      if (trends.length >= 2) {
        const currentCost = trends[0].cost;
        const previousCost = trends[1].cost;
        growthRate = previousCost > 0 ? (currentCost - previousCost) / previousCost : 0;
      }

      // Apply growth rate to estimation
      const adjustedDailyCost = avgDailyCost * (1 + growthRate);
      const estimatedCost = adjustedDailyCost * days;

      return {
        estimatedDailyCost: Math.max(0, adjustedDailyCost),
        estimatedCost: Math.max(0, estimatedCost),
        growthRate: growthRate * 100,
        confidence: trends.length >= 2 ? 'medium' : 'low',
        basedOnDays: daysInMonth,
        message: `Estimation based on ${trends.length} month(s) of data`
      };
    } catch (error) {
      console.error('❌ Error estimating future costs:', error.message);
      throw error;
    }
}

// Get cost alerts and recommendations
const getCostAlerts = async (agentId = null) => {
    try {
      const currentMonth = await getMonthlyCostTrends(agentId, 1);
      const previousMonth = await getMonthlyCostTrends(agentId, 2);
      
      const alerts = [];
      
      if (currentMonth.length > 0 && previousMonth.length > 1) {
        const current = currentMonth[0];
        const previous = previousMonth[1];
        
        // High cost increase alert
        if (previous.cost > 0) {
          const increase = ((current.cost - previous.cost) / previous.cost) * 100;
          if (increase > 50) {
            alerts.push({
              type: 'warning',
              message: `Cost increased by ${increase.toFixed(1)}% compared to last month`,
              recommendation: 'Review recent chat patterns and consider optimizing prompts'
            });
          }
        }
        
        // High session cost alert
        const avgSessionCost = current.sessions > 0 ? current.cost / current.sessions : 0;
        if (avgSessionCost > 0.10) {
          alerts.push({
            type: 'info',
            message: `Average session cost is $${avgSessionCost.toFixed(4)}`,
            recommendation: 'Consider using gpt-4o-mini for simpler queries'
          });
        }
      }
      
      return alerts;
    } catch (error) {
      console.error('❌ Error getting cost alerts:', error.message);
      return [];
    }
}

module.exports = {
  calculateSessionCost,
  getCostRates,
  getAgentCostSummary,
  getAllAgentsCostSummary,
  getMonthlyCostTrends,
  getModelUsageBreakdown,
  estimateFutureCosts,
  getCostAlerts
};