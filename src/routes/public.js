const express = require('express');
const publicController = require('../controllers/publicController');
const router = express.Router();

// GET /health - Health check endpoint
router.get('/health', publicController.healthCheck);

// GET /info - System information
router.get('/info', publicController.getSystemInfo);

// POST /chat - Public chat endpoint for testing
router.post('/chat', publicController.publicChat);

// GET /agent/:agentId - Get public agent information
router.get('/agent/:agentId', publicController.getPublicAgentInfo);

// GET /docs - API documentation
router.get('/docs', publicController.getApiDocs);

module.exports = router;