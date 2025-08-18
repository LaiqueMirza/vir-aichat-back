const { supabaseClient } = require('../config/supabase');
const FileSupabase = require('../models/FileSupabase');
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
      const { agentId } = req.params;
      
      const files = await FileSupabase.getAllByAgent(agentId);
      
      res.json({
        success: true,
        data: files
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
      
      // Read file buffer for Supabase Storage
      const fileBuffer = await fs.readFile(req.file.path);
      
      // Store file metadata with Supabase Storage integration
      const fileRecord = await FileSupabase.create(
        agentId,
        req.file.originalname,
        path.extname(req.file.originalname).toLowerCase().slice(1),
        req.file.size,
        fileBuffer,
        req.file.mimetype,
        'pending'
      );
      
      // Process embeddings
      const embeddingResult = await embeddingsService.processDocument({
        agentId,
        fileId: fileRecord?.id,
        content,
        filename: req.file.originalname
      });
      
      // Clean up local file after successful upload to Supabase Storage
      await fs.unlink(req.file.path).catch(console.error);
      
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
      const { agentId, fileId } = req.params;
      
      // Get file info
      const { data: file, error } = await supabaseClient
        .from('files')
        .select('*')
        .eq('id', fileId)
        .eq('agent_id', agentId)
        .single();
      
      if (error || !file) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      // Delete embeddings
      await embeddingsService.deleteAgentEmbeddings(agentId, fileId);
      
      // Delete file record
      const deletedFile = await FileSupabase.deleteFile(fileId);
      
      // Delete physical file
      if (file.file_url) {
        await fs.unlink(file.file_url).catch(console.error);
      }
      
      console.log(`✅ Deleted file: ${file.file_name}`);
      res.json({
        success: true,
        message: 'File deleted successfully',
        data: deletedFile
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
      const { agentId, fileId } = req.params;
      
      // Get file info
      const file = await FileSupabase.getById(fileId);
      
      if (!file || file.agent_id !== agentId) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      console.log(`🔄 Reprocessing file: ${file.file_name}`);
      
      // Parse file content again
      const content = await fileParser.parseFile(file.file_url);
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ 
          error: 'File processing error',
          message: 'Could not extract text content from file' 
        });
      }
      
      // Delete old embeddings
      await embeddingsService.deleteAgentEmbeddings(agentId, fileId);
      
      // Update file status
      await FileSupabase.updateEmbeddingStatus(fileId, 'pending');
      
      // Process new embeddings
      const embeddingResult = await embeddingsService.processDocument({
        agentId,
        fileId,
        content,
        filename: file.file_name
      });
      
      console.log(`✅ File reprocessed: ${file.file_name} (${embeddingResult.chunksProcessed} chunks, ${embeddingResult.tokensUsed} tokens, $${embeddingResult.cost.toFixed(4)})`);
      
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
      const { agentId, fileId } = req.params;
      
      // Get file info using FileSupabase model
      const file = await FileSupabase.getById(fileId);
      
      if (!file || file.agent_id !== agentId) {
        return res.status(404).json({ 
          error: 'File not found',
          message: 'File does not exist or does not belong to this agent' 
        });
      }
      
      // Parse file content
      const content = await fileParser.parseFile(file.file_url);
      
      res.json({
        success: true,
        data: {
          file: {
            id: file.id,
            originalName: file.file_name,
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