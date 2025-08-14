const { pool } = require('../config/db');

// Get all agents
const getAllAgents = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC');
      res.json({
        success: true,
        data: result.rows
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
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { id } = req.params;
      const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      res.json({
        success: true,
        data: result.rows[0]
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
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { name, context } = req.body;
      
      if (!name) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Agent name is required' 
        });
      }
      
      const result = await pool.query(
        'INSERT INTO agents (name, context) VALUES ($1, $2) RETURNING *',
        [name, context || '']
      );
      
      console.log(`✅ Created agent: ${name}`);
      res.status(201).json({
        success: true,
        data: result.rows[0],
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
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { id } = req.params;
      const { name, context } = req.body;
      
      if (!name) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'Agent name is required' 
        });
      }
      
      const result = await pool.query(
        'UPDATE agents SET name = $1, context = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
        [name, context || '', id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      console.log(`✅ Updated agent: ${name}`);
      res.json({
        success: true,
        data: result.rows[0],
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
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM agents WHERE id = $1 RETURNING *', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Agent not found',
          message: `Agent with ID ${id} does not exist` 
        });
      }
      
      console.log(`✅ Deleted agent: ${result.rows[0].name}`);
      res.json({
        success: true,
        message: 'Agent deleted successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error deleting agent:', error.message);
      res.status(500).json({ 
        error: 'Failed to delete agent',
        message: error.message 
      });
    }
}

module.exports = {
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent
};