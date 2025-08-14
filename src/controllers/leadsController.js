const { pool } = require('../config/db');
const ragService = require('../services/ragService');
const Lead = require('../models/Lead');

// Get all leads for an agent
const getAgentLeads = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;
      
      let query = 'SELECT * FROM leads WHERE agent_id = $1';
      let params = [agentId];
      
      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await pool.query(query, params);
      
      res.json({
        success: true,
        data: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.rows.length
        }
      });
    } catch (error) {
      console.error('❌ Error fetching leads:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch leads',
        message: error.message 
      });
    }
}

// Get lead by ID
const getLeadById = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, leadId } = req.params;
      
      const result = await pool.query(
        'SELECT * FROM leads WHERE id = $1 AND agent_id = $2',
        [leadId, agentId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error fetching lead:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch lead',
        message: error.message 
      });
    }
}

// Extract lead from conversation
const extractLead = async (req, res) => {
    try {
      const { agentId } = req.params;
      const { conversationId, userId } = req.body;
      
      if (!conversationId) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Conversation ID is required' 
        });
      }
      
      console.log(`🔍 Extracting lead from conversation ${conversationId} for agent ${agentId}`);
      
      // Get conversation history
      let chatHistory = [];
      if (pool) {
        const chatResult = await pool.query(
          'SELECT * FROM chats WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at ASC',
          [agentId, userId || conversationId]
        );
        chatHistory = chatResult.rows;
      }
      
      if (chatHistory.length === 0) {
        return res.status(404).json({ 
          error: 'Conversation not found',
          message: 'No conversation history found for the given parameters' 
        });
      }
      
      // Extract lead information using AI
      const leadInfo = await ragService.extractLeadInfo(chatHistory);
      
      if (!leadInfo) {
        return res.json({
          success: true,
          data: null,
          message: 'No lead information could be extracted from the conversation'
        });
      }
      
      // Store lead in database
      let leadRecord = null;
      if (pool) {
        const result = await pool.query(
          'INSERT INTO leads (agent_id, user_id, name, email, phone, company, notes, status, source_conversation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
          [
            agentId,
            userId || conversationId,
            leadInfo.name || null,
            leadInfo.email || null,
            leadInfo.phone || null,
            leadInfo.company || null,
            leadInfo.notes || null,
            'new',
            conversationId
          ]
        );
        leadRecord = result.rows[0];
      }
      
      console.log(`✅ Lead extracted and stored: ${leadInfo.name || 'Unknown'} (${leadInfo.email || 'No email'})`);
      
      res.status(201).json({
        success: true,
        data: leadRecord,
        extractedInfo: leadInfo,
        message: 'Lead extracted successfully'
      });
    } catch (error) {
      console.error('❌ Error extracting lead:', error.message);
      res.status(500).json({ 
        error: 'Failed to extract lead',
        message: error.message 
      });
    }
}

// Create lead manually
const createLead = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      const { name, email, phone, company, notes, status = 'new', userId } = req.body;
      
      if (!name && !email) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Either name or email is required' 
        });
      }
      
      const result = await pool.query(
        'INSERT INTO leads (agent_id, user_id, name, email, phone, company, notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [agentId, userId || 'manual', name, email, phone, company, notes, status]
      );
      
      console.log(`✅ Created lead manually: ${name || email}`);
      res.status(201).json({
        success: true,
        data: result.rows[0],
        message: 'Lead created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating lead:', error.message);
      res.status(500).json({ 
        error: 'Failed to create lead',
        message: error.message 
      });
    }
}

// Update lead
const updateLead = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, leadId } = req.params;
      const { name, email, phone, company, notes, status } = req.body;
      
      const result = await pool.query(
        'UPDATE leads SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), company = COALESCE($4, company), notes = COALESCE($5, notes), status = COALESCE($6, status), updated_at = CURRENT_TIMESTAMP WHERE id = $7 AND agent_id = $8 RETURNING *',
        [name, email, phone, company, notes, status, leadId, agentId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      console.log(`✅ Updated lead: ${result.rows[0].name || result.rows[0].email}`);
      res.json({
        success: true,
        data: result.rows[0],
        message: 'Lead updated successfully'
      });
    } catch (error) {
      console.error('❌ Error updating lead:', error.message);
      res.status(500).json({ 
        error: 'Failed to update lead',
        message: error.message 
      });
    }
}

// Delete lead
const deleteLead = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, leadId } = req.params;
      
      const result = await pool.query(
        'DELETE FROM leads WHERE id = $1 AND agent_id = $2 RETURNING *',
        [leadId, agentId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      console.log(`✅ Deleted lead: ${result.rows[0].name || result.rows[0].email}`);
      res.json({
        success: true,
        message: 'Lead deleted successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error deleting lead:', error.message);
      res.status(500).json({ 
        error: 'Failed to delete lead',
        message: error.message 
      });
    }
}

// Get lead statistics
const getLeadStats = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified_leads,
          COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as leads_this_week,
          COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as leads_this_month
        FROM leads 
        WHERE agent_id = $1
      `, [agentId]);
      
      const stats = statsResult.rows[0];
      
      res.json({
        success: true,
        data: {
          total: parseInt(stats.total_leads),
          byStatus: {
            new: parseInt(stats.new_leads),
            contacted: parseInt(stats.contacted_leads),
            qualified: parseInt(stats.qualified_leads),
            converted: parseInt(stats.converted_leads)
          },
          recent: {
            thisWeek: parseInt(stats.leads_this_week),
            thisMonth: parseInt(stats.leads_this_month)
          }
        }
      });
    } catch (error) {
      console.error('❌ Error fetching lead stats:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch lead statistics',
        message: error.message 
      });
    }
}

// Get all leads across all agents (for admin dashboard)
const getAllLeads = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    const leads = await Lead.getAll(status, parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      data: leads,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: leads.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching all leads:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch leads',
      message: error.message 
    });
  }
};

module.exports = {
  getAllLeads,
  getAgentLeads,
  getLeadById,
  extractLead,
  createLead,
  updateLead,
  deleteLead,
  getLeadStats
};