const express = require('express');
const agentsController = require('../controllers/agentsController');
const router = express.Router();
const upload = require("../services/uploadMiddleware");

// Get all agents
router.get('/', agentsController.getAllAgents);

// Get agent by ID
router.get('/:agent_id', agentsController.getAgentById);

// Create new agent
router.post("/", upload.array("file", 10), agentsController.createAgent);

// Update agent
router.put('/:agent_id', agentsController.updateAgent);

// Delete agent
router.delete('/:agent_id', agentsController.deleteAgent);

module.exports = router;