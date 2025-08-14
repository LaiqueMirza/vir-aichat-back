const express = require('express');
const leadsController = require('../controllers/leadsController');
const router = express.Router();

// GET /api/leads/all - Get all leads across all agents (for admin dashboard)
router.get('/all', leadsController.getAllLeads);

// GET /api/leads/:agentId - Get all leads for an agent
router.get('/:agentId', leadsController.getAgentLeads);

// GET /api/leads/lead/:id - Get specific lead
router.get('/lead/:id', leadsController.getLeadById);

// POST /api/leads/:agentId - Create new lead
router.post('/:agentId', leadsController.createLead);

// PUT /api/leads/:id - Update lead
router.put('/:id', leadsController.updateLead);

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', leadsController.deleteLead);

// GET /api/leads/:agentId/stats - Get lead statistics
router.get('/:agentId/stats', leadsController.getLeadStats);

module.exports = router;