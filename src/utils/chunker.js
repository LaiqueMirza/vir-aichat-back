const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

// Create a default splitter instance
const createSplitter = (chunkSize = 1000, chunkOverlap = 200) => {
  return new RecursiveCharacterTextSplitter({
    chunkSize: chunkSize,
    chunkOverlap: chunkOverlap,
    separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', '']
  });
};

// Split text into chunks
const chunkText = async (text, metadata = {}, chunkSize = 1000, chunkOverlap = 200) => {
  const splitter = createSplitter(chunkSize, chunkOverlap);
  try {
    const chunks = await splitter.splitText(text);
      
      return chunks.map((chunk, index) => ({
        content: chunk.trim(),
        metadata: {
          ...metadata,
          chunkIndex: index,
          chunkCount: chunks.length,
          chunkSize: chunk.length
        }
      }));
    } catch (error) {
      console.error('Error chunking text:', error.message);
      throw error;
    }
}

// Split documents with metadata preservation
const chunkDocument = async (content, fileName, agentId, additionalMetadata = {}, chunkSize = 1000, chunkOverlap = 200) => {
  try {
    const chunks = await chunkText(content, {
      fileName: fileName,
      agentId: agentId,
      ...additionalMetadata
    }, chunkSize, chunkOverlap);

      return chunks.map((chunk, index) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          documentId: `${agentId}_${fileName}_${index}`,
          createdAt: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Error chunking document:', error.message);
      throw error;
    }
}

// Create semantic chunks based on content structure
const createSemanticChunks = async (text, metadata = {}, chunkSize = 1000, chunkOverlap = 200) => {
  const splitter = createSplitter(chunkSize, chunkOverlap);
    try {
      // First, try to split by paragraphs
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      
    if (paragraphs.length === 1) {
      // If no paragraphs, use regular chunking
      return await chunkText(text, metadata, chunkSize, chunkOverlap);
    }

      const chunks = [];
      let currentChunk = '';
      let chunkIndex = 0;

      for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
      
      if (potentialChunk.length <= chunkSize) {
          currentChunk = potentialChunk;
        } else {
          // Save current chunk if it exists
          if (currentChunk) {
            chunks.push({
              content: currentChunk.trim(),
              metadata: {
                ...metadata,
                chunkIndex: chunkIndex++,
                chunkType: 'semantic',
                chunkSize: currentChunk.length
              }
            });
          }
          
        // Start new chunk with current paragraph
        if (paragraph.length <= chunkSize) {
            currentChunk = paragraph;
        } else {
          // If paragraph is too long, split it normally
          const subChunks = await chunkText(paragraph, metadata, chunkSize, chunkOverlap);
            chunks.push(...subChunks.map(chunk => ({
              ...chunk,
              metadata: {
                ...chunk.metadata,
                chunkIndex: chunkIndex++,
                chunkType: 'split'
              }
            })));
            currentChunk = '';
          }
        }
      }

      // Add the last chunk
      if (currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            ...metadata,
            chunkIndex: chunkIndex,
            chunkType: 'semantic',
            chunkSize: currentChunk.length
          }
        });
      }

      // Update chunk count in all chunks
      return chunks.map(chunk => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          chunkCount: chunks.length
        }
      }));
    } catch (error) {
    console.error('Error creating semantic chunks:', error.message);
    // Fallback to regular chunking
    return await chunkText(text, metadata, chunkSize, chunkOverlap);
    }
}

// Optimize chunks for better retrieval
const optimizeChunks = (chunks, minChunkSize = 100) => {
    return chunks.filter(chunk => {
      // Remove very small chunks that might not be meaningful
      if (chunk.content.length < minChunkSize) {
        return false;
      }
      
      // Remove chunks that are mostly whitespace or special characters
      const meaningfulContent = chunk.content.replace(/[\s\n\r\t]/g, '');
      if (meaningfulContent.length < minChunkSize * 0.5) {
        return false;
      }
      
      return true;
    }).map((chunk, index) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        optimizedIndex: index,
        isOptimized: true
      }
    }));
}

module.exports = {
  createSplitter,
  chunkText,
  chunkDocument,
  createSemanticChunks,
  optimizeChunks
};