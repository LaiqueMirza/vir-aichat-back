const { supabaseClient } = require('../config/supabase');
const AgentSupabase = require('../models/AgentSupabase');

// Get all agents
const getAllAgents = async (req, res) => {
    try {
      const { user_id } = req.query;
      
      let data;
      if (user_id) {
        data = await AgentSupabase.getAllByUser(user_id);
      } else {
        const { data: agents, error } = await supabaseClient
          .from('agents')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        data = agents;
      }
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('❌ Error fetching agents:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch agents',
        message: error.message 
      });
    }
}

// Get agent by ID
const getAgentById = async (req, res) => {
    try {
      const { id } = req.params;
      
      const agent = await AgentSupabase.getById(id);
      
      if (!agent) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      res.json({
        success: true,
        data: agent
      });
    } catch (error) {
      console.error('❌ Error fetching agent:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch agent',
        message: error.message 
      });
    }
}

// Create new agent
const createAgent = async (req, res) => {
    try {
      const { name, description, files } = req.body;
      
      if (!name) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Agent name is required' 
        });
      }
      
      // Create the agent first
      const agent = await AgentSupabase.create(
        name, 
        description || '', 
      );
      
      // Process files if they were included in the request
      let fileResults = [];
      if (files && Array.isArray(files) && files.length > 0) {
        console.log(`Processing ${files.length} files for agent ${agent.id}`);
        
        // We'll handle files in a separate endpoint
        // This is just to acknowledge we received the file information
        fileResults = files.map(file => ({
          name: file.name,
          type: file.type,
          size: file.size,
          status: 'pending'
        }));
      }
      
      console.log(`✅ Created agent: ${name}`);
      res.status(201).json({
        success: true,
        data: agent,
        files: fileResults,
        message: 'Agent created successfully'
      });
    } catch (error) {
      console.error('❌ Error creating agent:', error.message);
      res.status(500).json({ 
        error: 'Failed to create agent',
        message: error.message 
      });
    }
}

// Update agent
const updateAgent = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, system_prompt, welcome_message, avatar_url } = req.body;
      
      if (!name) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Agent name is required' 
        });
      }
      
      // Check if agent exists
      const existingAgent = await AgentSupabase.getById(id);
      if (!existingAgent) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      const updatedAgent = await AgentSupabase.update(id, {
        name,
        description,
        system_prompt,
        welcome_message,
        avatar_url
      });
      
      console.log(`✅ Updated agent: ${name}`);
      res.json({
        success: true,
        data: updatedAgent,
        message: 'Agent updated successfully'
      });
    } catch (error) {
      console.error('❌ Error updating agent:', error.message);
      res.status(500).json({ 
        error: 'Failed to update agent',
        message: error.message 
      });
    }
}

// Delete agent
const deleteAgent = async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if agent exists
      const existingAgent = await AgentSupabase.getById(id);
      if (!existingAgent) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      const deletedAgent = await AgentSupabase.deleteAgent(id);
      
      console.log(`✅ Deleted agent: ${deletedAgent.name}`);
      res.json({
        success: true,
        message: 'Agent deleted successfully',
        data: deletedAgent
      });
    } catch (error) {
      console.error('❌ Error deleting agent:', error.message);
      res.status(500).json({ 
        error: 'Failed to delete agent',
        message: error.message 
      });
    }
}

// Get agent statistics
const getAgentStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if agent exists
    const existingAgent = await AgentSupabase.getById(id);
    if (!existingAgent) {
      return res.status(404).json({ 
        error: 'Agent not found',
        message: `Agent with ID ${id} does not exist` 
      });
    }
    
    const stats = await AgentSupabase.getStats(id);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error fetching agent stats:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch agent statistics',
      message: error.message 
    });
  }
}

module.exports = {
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentStats
};