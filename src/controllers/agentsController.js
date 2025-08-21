const { supabaseClient } = require('../config/supabase');
const AgentSupabase = require('../models/AgentSupabase');
const FileSupabase = require('../models/FileSupabase');
const FileParser = require('../utils/fileParser');
const embeddingsService = require('../services/embeddingsService');
const fs = require('fs').promises;
const path = require('path');

// Get all agents
const getAllAgents = async (req, res) => {
    try {
      let data = await AgentSupabase.getAllByUser();

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
      const { agent_id } = req.params;
      
      const agent = await AgentSupabase.getById(agent_id);
      
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
      const { name, description } = req.body;
      
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
      
      // Process uploaded files if they exist
      let fileResults = [];
      if (req.files && req.files.length > 0) {
        console.log(`Processing ${req.files.length} files for agent ${agent.id}`);
        
        const filePromises = req.files.map(async (file) => {
          const fileBuffer = await fs.readFile(file.path);
          return {
            agentId: agent.agent_id,
            fileName: file.originalname,
            fileType: path.extname(file.originalname).toLowerCase().slice(1),
            fileSize: file.size,
            fileBuffer,
            contentType: file.mimetype
          };
        });

        const fileData = await Promise.all(filePromises);
        fileResults = await FileSupabase.createBatch(fileData);
        
        // Extract text content from the files and process embeddings
        const extractedContents = [];
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const fileResult = fileResults[i];
          
          try {
            console.log(`📄 Extracting text from: ${file.originalname}`);
            
            // Extract text content using FileParser
            const fileType = path.extname(file.originalname).toLowerCase().slice(1);
            const extractedData = await FileParser.parseFile(file.path, fileType);
            
            // Clean and normalize the extracted text
            const cleanedContent = FileParser.cleanText(extractedData.content);
            
            if (cleanedContent && cleanedContent.trim().length > 0) {
              extractedContents.push({
                fileId: fileResult.id,
                fileName: file.originalname,
                content: cleanedContent,
                metadata: extractedData.metadata
              });
              
              // Process embeddings for the extracted content
              console.log(`🔄 Processing embeddings for: ${file.originalname}`);
              const embeddingResult = await embeddingsService.processDocument(
                 agent.agent_id,
                 fileResult.file_id,
                 cleanedContent,
                 file.originalname
              );
              
              console.log(`✅ Embeddings processed: ${embeddingResult} `);
            } else {
              console.warn(`⚠️ No text content extracted from: ${file.originalname}`);
            }
          } catch (extractionError) {
            console.error(`❌ Error extracting text from ${file.originalname}:`, extractionError.message);
            // Continue processing other files even if one fails
          }
        }

        // Clean up uploaded files
        await Promise.all(req.files.map(file => fs.unlink(file.path)));
      }
      
      console.log(`✅ Created agent: ${name}`);
      res.status(201).json({
        success: true,
        data: agent,
        // message: `Agent created successfully${extractedContents.length > 0 ? ` with ${extractedContents.length} files processed` : ''}`
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
      const { agent_id } = req.params;
      
      // Check if agent exists
      const existingAgent = await AgentSupabase.getById(agent_id);
      if (!existingAgent) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${agent_id} does not exist` 
        });
      }
      
      const deletedAgent = await AgentSupabase.deleteAgent(agent_id);
      
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