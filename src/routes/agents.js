const express = require('express');
const agentsController = require('../controllers/agentsController');
const router = express.Router();

// Get all agents
router.get('/', agentsController.getAllAgents);

// Get agent by ID
router.get('/:id', agentsController.getAgentById);

// Create new agent
router.post('/', agentsController.createAgent);

// Update agent
router.put('/:id', agentsController.updateAgent);

// Delete agent
router.delete('/:id', agentsController.deleteAgent);

module.exports = router;