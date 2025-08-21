const express = require('express');
const router = express.Router();

// Import all route modules
const agentsRoutes = require('./agents.route');
const filesRoutes = require('./files');
const chatRoutes = require('./chat');
const leadsRoutes = require('./leads');
const analyticsRoutes = require('./analytics');
const publicRoutes = require('./public');

// Mount routes
router.use('/api/agents', agentsRoutes);
router.use('/api/files', filesRoutes);
router.use('/api/chat', chatRoutes);
router.use('/api/leads', leadsRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/', publicRoutes);

module.exports = router;