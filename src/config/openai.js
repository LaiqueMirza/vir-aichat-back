const { OpenAI } = require('@langchain/openai');
const { OpenAIEmbeddings } = require('@langchain/openai');

// Check if OpenAI API key is configured
const isOpenAIConfigured = process.env.OPENAI_API_KEY && 
                          process.env.OPENAI_API_KEY !== 'your_openai_api_key_here';

if (!isOpenAIConfigured) {
  console.warn('⚠️ OpenAI API key not configured - AI features will be disabled');
}

// OpenAI Configuration
const openaiConfig = {
  openAIApiKey: process.env.OPENAI_API_KEY || 'dummy-key',
  temperature: 0.7,
  maxTokens: 2000,
};

// Initialize OpenAI models (only if configured)
let gpt4o = null;
let gpt4oMini = null;
let embeddings = null;

if (isOpenAIConfigured) {
  try {
    gpt4o = new OpenAI({
      ...openaiConfig,
      modelName: 'gpt-4o',
      temperature: 0.7,
    });

    gpt4oMini = new OpenAI({
      ...openaiConfig,
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
    });

    // Initialize embeddings model
    embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });
    
    console.log('✅ OpenAI models initialized');
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI models:', error.message);
  }
}

// Token cost calculation
const calculateCost = (inputTokens, outputTokens, model = 'gpt-4o-mini') => {
  const costs = {
    'gpt-4o': {
      input: parseFloat(process.env.GPT4O_INPUT_COST) || 0.0025,
      output: parseFloat(process.env.GPT4O_OUTPUT_COST) || 0.01
    },
    'gpt-4o-mini': {
      input: parseFloat(process.env.GPT4O_MINI_INPUT_COST) || 0.00015,
      output: parseFloat(process.env.GPT4O_MINI_OUTPUT_COST) || 0.0006
    }
  };
  
  const modelCosts = costs[model] || costs['gpt-4o-mini'];
  const inputCost = (inputTokens / 1000) * modelCosts.input;
  const outputCost = (outputTokens / 1000) * modelCosts.output;
  
  return inputCost + outputCost;
};

// Calculate embedding cost
const calculateEmbeddingCost = (tokens) => {
  const embeddingCost = parseFloat(process.env.EMBEDDING_COST) || 0.00002;
  return (tokens / 1000) * embeddingCost;
};

module.exports = {
  gpt4o,
  gpt4oMini,
  embeddings,
  calculateCost,
  calculateEmbeddingCost
};