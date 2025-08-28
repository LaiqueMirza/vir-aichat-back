const { embeddings, calculateEmbeddingCost } = require('../config/openai');
const { storeEmbedding, searchSimilarEmbeddings, deleteAgentEmbeddings: deleteAgentEmbeddingsFromDb, deleteFileEmbeddings: deleteFileEmbeddingsFromDb } = require('../config/vectorDb');
const { chunkDocument, optimizeChunks } = require('../utils/chunker');
const tokenCounter = require('../utils/tokenCounter');

// Process and store document embeddings
const processDocument = async (agentId, fileId, content, metadata = {}) => {
    try {
      console.log(`📄 Processing document: ${fileId} for agent: ${agentId}`);
      
      // Clean and chunk the content
      const chunks = await chunkDocument(content, fileId, agentId, metadata);
      const optimizedChunks = optimizeChunks(chunks);
      
      console.log(`📊 Created ${optimizedChunks.length} chunks from ${fileId}`);
      
      const results = [];
      let totalTokens = 0;
      let totalCost = 0;

      // Process chunks in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < optimizedChunks.length; i += batchSize) {
        const batch = optimizedChunks.slice(i, i + batchSize);
        const batchResults = await processBatch(fileId, batch);
        
        results.push(...batchResults);
        
        // Calculate costs
        for (const result of batchResults) {
          totalTokens += result.tokens;
          totalCost += result.cost;
        }
        
        // Small delay between batches
        if (i + batchSize < optimizedChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Processed ${results.length} embeddings. Tokens: ${totalTokens}, Cost: $${totalCost.toFixed(6)}`);
      
      return {
        success: true,
        chunksProcessed: results.length,
        totalTokens,
        totalCost,
        results
      };
    } catch (error) {
      console.error('❌ Error processing document:', error.message);
      throw error;
    }
}

// Process a batch of chunks
const processBatch = async (fileId, chunks) => {
    const results = [];
    
    if (!embeddings) {
      console.warn('⚠️ Skipping embedding generation - OpenAI not configured');
      return chunks.map(chunk => ({
        chunkId: chunk.metadata.documentId,
        tokens: 0,
        cost: 0,
        success: false,
        error: 'OpenAI not configured'
      }));
    }
    
    for (const chunk of chunks) {
      try {
        // Count tokens for cost calculation
        const tokens = tokenCounter.countEmbeddingTokens(chunk.content);
        const cost = calculateEmbeddingCost(tokens);
        
        // Generate embedding
        const embedding = await embeddings.embedQuery(chunk.content);
        
        // Store in vector database
        await storeEmbedding(fileId, chunk.content, embedding);
        
        results.push({
          chunkId: chunk.metadata.documentId,
          tokens,
          cost,
          success: true
        });
        
      } catch (error) {
        console.error(`❌ Error processing chunk ${chunk.metadata.documentId}:`, error.message);
        results.push({
          chunkId: chunk.metadata.documentId,
          tokens: 0,
          cost: 0,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

// Search for relevant content using embeddings
const searchRelevantContent = async (agentId, query, limit = 3, threshold = 0.3) => {
    try {
      
      if (!embeddings) {
        console.warn('⚠️ Skipping content search - OpenAI not configured');
        return [];
      }
      
      // Generate query embedding
      const queryEmbedding = await embeddings.embedQuery(query);
      
      // Search similar embeddings
      const results = await searchSimilarEmbeddings(agentId, queryEmbedding, limit, threshold);
      
      console.log(`📋 Found ${results.length} relevant chunks`);
      
      return results.map(result => ({
        content: result.content,
        similarity: result.similarity,
        metadata: result.metadata
      }));
    } catch (error) {
      console.error('❌ Error searching relevant content:', error.message);
      throw error;
    }
}

// Delete all embeddings for an agent
const deleteAgentEmbeddings = async (agentId) => {
    try {
      console.log(`🗑️ Deleting embeddings for agent: ${agentId}`);
      await deleteAgentEmbeddingsFromDb(agentId);
      console.log(`✅ Deleted embeddings for agent: ${agentId}`);
    } catch (error) {
      console.error('❌ Error deleting agent embeddings:', error.message);
      throw error;
    }
  }

// Delete embeddings for a specific file
const deleteFileEmbeddings = async (fileId) => {
    try {
      console.log(`🗑️ Deleting embeddings for file: ${fileId}`);
      await deleteFileEmbeddingsFromDb(fileId);
      console.log(`✅ Deleted embeddings for file: ${fileId}`);
    } catch (error) {
      console.error('❌ Error deleting file embeddings:', error.message);
      throw error;
    }
  }

// Reprocess documents for an agent
const reprocessAgentDocuments = async (agentId, documents) => {
    try {
      console.log(`🔄 Reprocessing ${documents.length} documents for agent: ${agentId}`);
      
      // Delete existing embeddings
      await this.deleteAgentEmbeddings(agentId);
      
      const results = [];
      let totalTokens = 0;
      let totalCost = 0;
      
      // Process each document
      for (const doc of documents) {
        const result = await processDocument(
          agentId,
          doc.filename,
          doc.content,
          doc.metadata
        );
        
        results.push(result);
        totalTokens += result.totalTokens;
        totalCost += result.totalCost;
      }
      
      console.log(`✅ Reprocessed all documents. Total tokens: ${totalTokens}, Total cost: $${totalCost.toFixed(6)}`);
      
      return {
        success: true,
        documentsProcessed: documents.length,
        totalTokens,
        totalCost,
        results
      };
    } catch (error) {
      console.error('❌ Error reprocessing agent documents:', error.message);
      throw error;
    }
}

// Get embedding statistics for an agent
const getEmbeddingStats = async (agentId) => {
    try {
      // This would require a custom query to the vector database
      // For now, return basic stats
      return {
        agentId,
        // These would be calculated from actual vector DB queries
        totalEmbeddings: 0,
        totalTokens: 0,
        estimatedCost: 0
      };
    } catch (error) {
      console.error('❌ Error getting embedding stats:', error.message);
      throw error;
    }
}

module.exports = {
  processDocument,
  processBatch,
  searchRelevantContent,
  deleteAgentEmbeddings,
  deleteFileEmbeddings,
  reprocessAgentDocuments,
  getEmbeddingStats
};