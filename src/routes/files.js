const express = require('express');
const filesController = require('../controllers/filesController');
const router = express.Router();

// GET /api/files/:agentId - Get all files for an agent
router.get('/:agentId', filesController.getAgentFiles);

// POST /api/files/:agentId/upload - Upload file for an agent
router.post('/:agentId/upload', filesController.getUploadMiddleware(), filesController.uploadFile);

// DELETE /api/files/:id - Delete file
router.delete('/:fileId', filesController.deleteFile);

// POST /api/files/:id/reprocess - Reprocess file embeddings
router.post('/:id/reprocess', filesController.reprocessFile);

// GET /api/files/:id/content - Get file content preview
router.get('/:id/content', filesController.getFileContent);

module.exports = router;