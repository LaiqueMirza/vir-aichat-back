const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const router = express.Router();

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', analyticsController.getDashboardAnalytics);

// GET /api/analytics/:agentId - Get agent analytics
router.get('/:agentId', analyticsController.getAgentAnalytics);

// GET /api/analytics/:agentId/costs - Get cost breakdown
router.get('/:agentId/costs', analyticsController.getCostBreakdown);

// GET /api/analytics/:agentId/engagement - Get user engagement metrics
router.get('/:agentId/engagement', analyticsController.getUserEngagement);

// GET /api/analytics/:agentId/performance - Get performance metrics
router.get('/:agentId/performance', analyticsController.getPerformanceMetrics);

module.exports = router;