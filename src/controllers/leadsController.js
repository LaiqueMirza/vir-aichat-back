const { getSupabaseClient } = require('../config/supabase');
const ragService = require('../services/ragService');
const LeadSupabase = require('../models/LeadSupabase');
const Lead = require('../models/Lead');
const ChatSupabase = require("../models/ChatSupabase");
const AgentSupabase = require("../models/AgentSupabase");

// Get all leads for an agent
const getAgentLeads = async (req, res) => {
    try {
      const { agentId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;
      
      let leads;
      
      if (status) {
        // If status is provided, use getByStatus
        leads = await LeadSupabase.getByStatus(agentId, status);
      } else {
        // Otherwise get all leads for the agent
        leads = await LeadSupabase.getAllByAgent(agentId);
      }
      
      // Apply pagination manually (since Supabase client doesn't support offset/limit in this model)
      const paginatedLeads = leads.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
      
      res.json({
        success: true,
        data: paginatedLeads,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: leads.length
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
      const { agentId, leadId } = req.params;
      
      // Get lead by ID using LeadSupabase model
      const lead = await LeadSupabase.getById(leadId);
      
      // Check if lead exists and belongs to the specified agent
      if (!lead || lead.agent_id !== agentId) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      res.json({
        success: true,
        data: lead
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
      const { data: chats, error } = await getSupabaseClient()
        .from('chats')
        .select('*')
        .eq('agent_id', agentId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      chatHistory = chats;
      
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
      // Create lead using LeadSupabase model
      leadRecord = await LeadSupabase.create(
				agentId,
				leadInfo.name || null,
				leadInfo.mobile || null,
				leadInfo.email || null
			);
      
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
      const { agent_id } = req.params;
      
      const agent = await AgentSupabase.getById(agent_id);

      // Create lead using LeadSupabase model
      const lead = await LeadSupabase.create(
        agent_id,
      );
      
      const chat = await ChatSupabase.create(agent_id, lead.lead_id);
      res.status(201).json({
        success: true,
        lead,
        chat,
        agent,
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
      const { agentId, leadId } = req.params;
      const { name, email, mobile } = req.body;
      
      // Get the lead first to check if it exists and belongs to the agent
      const existingLead = await LeadSupabase.getById(leadId);
      
      if (!existingLead || existingLead.agent_id !== agentId) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      // Update lead using LeadSupabase model
      const updatedLead = await LeadSupabase.update(leadId, {
				name: name || existingLead.name,
				email: email || existingLead.email,
				mobile: mobile || existingLead.mobile,
			});
      
      console.log(`✅ Updated lead: ${updatedLead.name || updatedLead.email}`);
      res.json({
        success: true,
        data: updatedLead,
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
      const { agentId, leadId } = req.params;
      
      // Get the lead first to check if it exists and belongs to the agent
      const existingLead = await LeadSupabase.getById(leadId);
      
      if (!existingLead || existingLead.agent_id !== agentId) {
        return res.status(404).json({ 
          error: 'Lead not found',
          message: 'Lead does not exist or does not belong to this agent' 
        });
      }
      
      // Delete lead using LeadSupabase model
      await LeadSupabase.deleteLead(leadId);
      
      console.log(`✅ Deleted lead: ${existingLead.name || existingLead.email}`);
      res.json({
        success: true,
        data: existingLead,
        message: 'Lead deleted successfully'
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
      const { agentId } = req.params;
      
      // Get lead statistics using LeadSupabase model
      const stats = await LeadSupabase.getStats(agentId);
      
      res.json({
        success: true,
        data: stats
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
    
    // Get all leads with agent information and chat counts using Lead model
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