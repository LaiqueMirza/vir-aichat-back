const { encoding_for_model } = require('tiktoken');

class TokenCounter {
  constructor() {
    // Initialize encoders for different models
    this.encoders = {
      'gpt-4o': encoding_for_model('gpt-4'),
      'gpt-4o-mini': encoding_for_model('gpt-4'),
      'text-embedding-3-small': encoding_for_model('text-embedding-ada-002')
    };
  }

  // Count tokens for a given text and model
  countTokens(text, model = 'gpt-4o-mini') {
    try {
      const encoder = this.encoders[model] || this.encoders['gpt-4o-mini'];
      const tokens = encoder.encode(text);
      return tokens.length;
    } catch (error) {
      console.error('Error counting tokens:', error.message);
      // Fallback: rough estimation (1 token ≈ 4 characters)
      return Math.ceil(text.length / 4);
    }
  }

  // Count tokens for messages array (chat format)
  countMessageTokens(messages, model = 'gpt-4o-mini') {
    try {
      let totalTokens = 0;
      
      for (const message of messages) {
        // Count tokens for role and content
        totalTokens += this.countTokens(message.role || '', model);
        totalTokens += this.countTokens(message.content || '', model);
        
        // Add overhead tokens for message formatting
        totalTokens += 4; // Approximate overhead per message
      }
      
      // Add overhead for the conversation
      totalTokens += 2;
      
      return totalTokens;
    } catch (error) {
      console.error('Error counting message tokens:', error.message);
      // Fallback calculation
      const totalText = messages.map(m => (m.role || '') + (m.content || '')).join(' ');
      return this.countTokens(totalText, model);
    }
  }

  // Estimate tokens for embeddings
  countEmbeddingTokens(text) {
    return this.countTokens(text, 'text-embedding-3-small');
  }

  // Calculate token usage for a chat completion
  calculateChatTokenUsage(messages, response, model = 'gpt-4o-mini') {
    const inputTokens = this.countMessageTokens(messages, model);
    const outputTokens = this.countTokens(response, model);
    
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }

  // Estimate if text will exceed token limit
  willExceedLimit(text, limit = 4000, model = 'gpt-4o-mini') {
    const tokenCount = this.countTokens(text, model);
    return tokenCount > limit;
  }

  // Truncate text to fit within token limit
  truncateToTokenLimit(text, limit = 4000, model = 'gpt-4o-mini') {
    const encoder = this.encoders[model] || this.encoders['gpt-4o-mini'];
    
    try {
      const tokens = encoder.encode(text);
      
      if (tokens.length <= limit) {
        return text;
      }
      
      // Truncate tokens and decode back to text
      const truncatedTokens = tokens.slice(0, limit);
      return encoder.decode(truncatedTokens);
    } catch (error) {
      console.error('Error truncating text:', error.message);
      // Fallback: character-based truncation
      const estimatedChars = limit * 4;
      return text.substring(0, estimatedChars);
    }
  }

  // Get token limits for different models
  getModelLimits() {
    return {
      'gpt-4o': {
        maxTokens: 128000,
        maxOutputTokens: 4096
      },
      'gpt-4o-mini': {
        maxTokens: 128000,
        maxOutputTokens: 16384
      },
      'text-embedding-3-small': {
        maxTokens: 8191
      }
    };
  }

  // Validate if content fits within model limits
  validateTokenLimits(content, model = 'gpt-4o-mini') {
    const limits = this.getModelLimits()[model];
    if (!limits) {
      return { valid: false, error: 'Unknown model' };
    }

    const tokenCount = this.countTokens(content, model);
    
    if (tokenCount > limits.maxTokens) {
      return {
        valid: false,
        error: `Content exceeds token limit: ${tokenCount} > ${limits.maxTokens}`,
        tokenCount,
        limit: limits.maxTokens
      };
    }

    return {
      valid: true,
      tokenCount,
      limit: limits.maxTokens,
      remaining: limits.maxTokens - tokenCount
    };
  }

  // Clean up encoders
  cleanup() {
    Object.values(this.encoders).forEach(encoder => {
      if (encoder && typeof encoder.free === 'function') {
        encoder.free();
      }
    });
  }
}

// Create singleton instance
const tokenCounter = new TokenCounter();

module.exports = tokenCounter;