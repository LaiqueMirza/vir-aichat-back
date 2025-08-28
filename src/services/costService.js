const { getSupabaseClient } = require('../config/supabase');

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
const getAgentCostSummary = async (
	agentId,
	startDate = null,
	endDate = null
) => {
	try {
		let query = getSupabaseClient()
			.from("chats")
			.select(
				`
          count(*),
          sum(total_tokens),
          sum(cost_usd),
          avg(cost_usd),
          avg(total_tokens),
          min(cost_usd),
          max(cost_usd),
          created_at
        `
			)
			.eq("agent_id", agentId);

		if (startDate && endDate) {
			query = query.gte("created_at", startDate).lte("created_at", endDate);
		}

		// Unfortunately, Supabase doesn't support DATE_TRUNC directly in the query builder
		// We'll need to process the data after fetching it
		const { data, error } = await query;

		if (error) throw error;

		// Group by day
		const dailyData = {};
		data.forEach((row) => {
			const date = new Date(row.created_at).toISOString().split("T")[0];
			if (!dailyData[date]) {
				dailyData[date] = {
					sessions: 0,
					tokens: 0,
					cost: 0,
				};
			}
			dailyData[date].sessions += 1;
			dailyData[date].tokens += parseInt(row.total_tokens || 0);
			dailyData[date].cost += parseFloat(row.cost_usd || 0);
		});

		// Calculate totals
		const dailyBreakdown = Object.keys(dailyData)
			.map((date) => ({
				date,
				sessions: dailyData[date].sessions,
				tokens: dailyData[date].tokens,
				cost: dailyData[date].cost,
			}))
			.sort((a, b) => new Date(b.date) - new Date(a.date));

		const totals = dailyBreakdown.reduce(
			(acc, row) => ({
				totalSessions: acc.totalSessions + row.sessions,
				totalTokens: acc.totalTokens + row.tokens,
				totalCost: acc.totalCost + row.cost,
			}),
			{ totalSessions: 0, totalTokens: 0, totalCost: 0 }
		);

		return {
			summary: {
				...totals,
				avgCostPerSession:
					totals.totalSessions > 0
						? totals.totalCost / totals.totalSessions
						: 0,
				avgTokensPerSession:
					totals.totalSessions > 0
						? totals.totalTokens / totals.totalSessions
						: 0,
			},
			dailyBreakdown,
		};
	} catch (error) {
		throw error;
	}
};

// Get cost summary for all agents
const getAllAgentsCostSummary = async (startDate = null, endDate = null) => {
	try {
		// First get all agents
		const { data: agents, error: agentsError } = await getSupabaseClient()
			.from("agents")
			.select("id, name");

		if (agentsError) throw agentsError;

		// For each agent, get their chats
		const agentSummaries = await Promise.all(
			agents.map(async (agent) => {
				let query = getSupabaseClient()
					.from("chats")
					.select("id, total_tokens, cost_usd")
					.eq("agent_id", agent.id);

				if (startDate && endDate) {
					query = query.gte("created_at", startDate).lte("created_at", endDate);
				}

				const { data: chats, error: chatsError } = await query;

				if (chatsError) throw chatsError;

				// Calculate metrics
				const totalSessions = chats.length;
				const totalTokens = chats.reduce(
					(sum, chat) => sum + (chat.total_tokens || 0),
					0
				);
				const totalCost = chats.reduce(
					(sum, chat) => sum + (chat.cost_usd || 0),
					0
				);
				const avgCostPerSession =
					totalSessions > 0 ? totalCost / totalSessions : 0;
				const avgTokensPerSession =
					totalSessions > 0 ? totalTokens / totalSessions : 0;

				return {
					agentId: agent.id,
					agentName: agent.name,
					totalSessions,
					totalTokens,
					totalCost,
					avgCostPerSession,
					avgTokensPerSession,
				};
			})
		);

		// Sort by total cost descending
		return agentSummaries.sort((a, b) => b.totalCost - a.totalCost);
	} catch (error) {
		throw error;
	}
};

// Get monthly cost trends
const getMonthlyCostTrends = async (agentId = null, months = 12) => {
	try {
		// Calculate the date from months ago
		const monthsAgo = new Date();
		monthsAgo.setMonth(monthsAgo.getMonth() - months);

		// Query chats created after that date
		let query = getSupabaseClient()
			.from("chats")
			.select("created_at, total_tokens, cost_usd")
			.gte("created_at", monthsAgo.toISOString());

		if (agentId) {
			query = query.eq("agent_id", agentId);
		}

		const { data, error } = await query;

		if (error) throw error;

		// Group by month
		const monthlyData = {};
		data.forEach((chat) => {
			// Extract year and month from created_at
			const date = new Date(chat.created_at);
			const monthKey = `${date.getFullYear()}-${String(
				date.getMonth() + 1
			).padStart(2, "0")}`;

			if (!monthlyData[monthKey]) {
				monthlyData[monthKey] = {
					month: new Date(date.getFullYear(), date.getMonth(), 1),
					sessions: 0,
					tokens: 0,
					cost: 0,
				};
			}

			monthlyData[monthKey].sessions += 1;
			monthlyData[monthKey].tokens += parseInt(chat.total_tokens || 0);
			monthlyData[monthKey].cost += parseFloat(chat.cost_usd || 0);
		});

		// Convert to array and sort by month descending
		return Object.values(monthlyData).sort((a, b) => b.month - a.month);
	} catch (error) {
		throw error;
	}
};

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