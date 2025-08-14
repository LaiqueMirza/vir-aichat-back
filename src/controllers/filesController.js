const { pool } = require('../config/db');
const embeddingsService = require('../services/embeddingsService');
const fileParser = require('../utils/fileParser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,txt,docx,md').split(',');
    const fileExt = path.extname(file.originalname).toLowerCase().slice(1);
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${fileExt} is not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Get upload middleware
const getUploadMiddleware = () => {
    return upload.single('file');
}

// Get all files for an agent
const getAgentFiles = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId } = req.params;
      const result = await pool.query(
        'SELECT * FROM files WHERE agent_id = $1 ORDER BY created_at DESC',
        [agentId]
      );
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('❌ Error fetching agent files:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch files',
        message: error.message 
      });
    }
}

// Upload and process file
const uploadFile = async (req, res) => {
    try {
      const { agentId } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ 
          error: 'Validation error',
          message: 'No file uploaded' 
        });
      }
      
      console.log(`📁 Processing file upload: ${req.file.originalname} for agent ${agentId}`);
      
      // Parse file content
      const content = await fileParser.parseFile(req.file.path, req.file.mimetype);
      
      if (!content || content.trim().length === 0) {
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(console.error);
        return res.status(400).json({ 
          error: 'File processing error',
          message: 'Could not extract text content from file' 
        });
      }
      
      // Store file metadata
      let fileRecord = null;
      if (pool) {
        const result = await pool.query(
          'INSERT INTO files (agent_id, filename, original_name, file_path, file_size, content_preview) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [
            agentId,
            req.file.filename,
            req.file.originalname,
            req.file.path,
            req.file.size,
            content.substring(0, 500) + (content.length > 500 ? '...' : '')
          ]
        );
        fileRecord = result.rows[0];
      }
      
      // Process embeddings
      const embeddingResult = await embeddingsService.processDocument({
        agentId,
        fileId: fileRecord?.id,
        content,
        filename: req.file.originalname
      });
      
      console.log(`✅ File processed: ${req.file.originalname} (${embeddingResult.chunksProcessed} chunks, ${embeddingResult.tokensUsed} tokens, $${embeddingResult.cost.toFixed(4)})`);
      
      res.status(201).json({
        success: true,
        data: {
          file: fileRecord,
          processing: embeddingResult
        },
        message: 'File uploaded and processed successfully'
      });
    } catch (error) {
      console.error('❌ Error uploading file:', error.message);
      
      // Clean up uploaded file on error
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(console.error);
      }
      
      res.status(500).json({ 
        error: 'Failed to upload file',
        message: error.message 
      });
    }
}

// Delete file
const deleteFile = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, fileId } = req.params;
      
      // Get file info
      const fileResult = await pool.query(
        'SELECT * FROM files WHERE id = $1 AND agent_id = $2',
        [fileId, agentId]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      const file = fileResult.rows[0];
      
      // Delete embeddings
      await embeddingsService.deleteAgentEmbeddings(agentId, fileId);
      
      // Delete file record
      await pool.query('DELETE FROM files WHERE id = $1', [fileId]);
      
      // Delete physical file
      if (file.file_path) {
        await fs.unlink(file.file_path).catch(console.error);
      }
      
      console.log(`✅ Deleted file: ${file.original_name}`);
      res.json({
        success: true,
        message: 'File deleted successfully',
        data: file
      });
    } catch (error) {
      console.error('❌ Error deleting file:', error.message);
      res.status(500).json({ 
        error: 'Failed to delete file',
        message: error.message 
      });
    }
}

// Reprocess file embeddings
const reprocessFile = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, fileId } = req.params;
      
      // Get file info
      const fileResult = await pool.query(
        'SELECT * FROM files WHERE id = $1 AND agent_id = $2',
        [fileId, agentId]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      const file = fileResult.rows[0];
      
      console.log(`🔄 Reprocessing file: ${file.original_name}`);
      
      // Parse file content again
      const content = await fileParser.parseFile(file.file_path);
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ 
          error: 'File processing error',
          message: 'Could not extract text content from file' 
        });
      }
      
      // Delete old embeddings
      await embeddingsService.deleteAgentEmbeddings(agentId, fileId);
      
      // Process new embeddings
      const embeddingResult = await embeddingsService.processDocument({
        agentId,
        fileId,
        content,
        filename: file.original_name
      });
      
      console.log(`✅ File reprocessed: ${file.original_name} (${embeddingResult.chunksProcessed} chunks, ${embeddingResult.tokensUsed} tokens, $${embeddingResult.cost.toFixed(4)})`);
      
      res.json({
        success: true,
        data: {
          file,
          processing: embeddingResult
        },
        message: 'File reprocessed successfully'
      });
    } catch (error) {
      console.error('❌ Error reprocessing file:', error.message);
      res.status(500).json({ 
        error: 'Failed to reprocess file',
        message: error.message 
      });
    }
}

// Get file content preview
const getFileContent = async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ 
          error: 'Database not configured',
          message: 'Database connection is not available' 
        });
      }

      const { agentId, fileId } = req.params;
      
      const fileResult = await pool.query(
        'SELECT * FROM files WHERE id = $1 AND agent_id = $2',
        [fileId, agentId]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      const file = fileResult.rows[0];
      
      // Parse file content
      const content = await fileParser.parseFile(file.file_path);
      
      res.json({
        success: true,
        data: {
          file: {
            id: file.id,
            originalName: file.original_name,
            size: file.file_size,
            createdAt: file.created_at
          },
          content,
          preview: content.substring(0, 1000) + (content.length > 1000 ? '...' : '')
        }
      });
    } catch (error) {
      console.error('❌ Error getting file content:', error.message);
      res.status(500).json({ 
        error: 'Failed to get file content',
        message: error.message 
      });
    }
}

module.exports = {
  getUploadMiddleware,
  getAgentFiles,
  uploadFile,
  deleteFile,
  reprocessFile,
  getFileContent
};