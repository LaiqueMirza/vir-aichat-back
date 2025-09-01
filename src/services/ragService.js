const { gpt4o, gpt4oMini, calculateCost } = require('../config/openai');
const embeddingsService = require('./embeddingsService');
const tokenCounter = require('../utils/tokenCounter');
const { PromptTemplate } = require('@langchain/core/prompts');
const { RunnableSequence } = require('@langchain/core/runnables');
const fs = require('fs');

// System prompt template for the AI agent
const systemPromptTemplate = PromptTemplate.fromTemplate(`
You are an AI assistant for {agentName}. Your role is to help customers by providing accurate, helpful, and professional responses based on the company's knowledge base.

Company Context:
{agentContext}

Instructions:
1. Use the provided context to answer questions accurately
2. If you don't have enough information, politely say so and ask for clarification
3. Be professional, friendly, and helpful
4. During the conversation, naturally collect the following lead information when appropriate:
   - Customer's name
   - mobile number
   - Email address
   - Preferred follow-up date
5. Don't be pushy about collecting information - let it flow naturally in the conversation
6. If the customer provides contact information, acknowledge it and confirm the details

Relevant Context:
{context}

Chat History:
{chatHistory}

Current Question: {question}

Please provide a helpful response:
`);

// Lead extraction prompt
const leadExtractionPrompt = PromptTemplate.fromTemplate(`
Analyze the following conversation and extract any lead information that was provided by the customer.

Conversation:
{conversation}

Extract the following information if mentioned:
- Name: (customer's full name)
- mobile: (mobile number in any format)
- Email: (email address)
- Follow-up Date: (any mentioned date for follow-up)

Return the information in JSON format. If any field is not mentioned, use null.
Example: {"name": "John Doe", "mobile": "+1234567890", "email": "john@example.com", "followUp": "2024-01-15"}

Lead Information:
    `);
// Create RAG prompt function
const createRagPrompt = async (
	agentName,
	agentDescription,
	context,
	formattedChatHistory,
	question,
	leadInfo
) => {
	// Pre-build missing info array for better performance
	const missingInfo = [];
	if (!leadInfo?.name) missingInfo.push('- name');
	if (!leadInfo?.mobile) missingInfo.push('- Mobile number');
	if (!leadInfo?.email) missingInfo.push('- Email address');
	
	const leadInfoSection = missingInfo.length > 0 
		? `\n\nAt the end of the response ask user question to naturally collect any one of the below user information make sure the question is in a separate line and is highlighted:\n${missingInfo.join('\n')}\n`
		: '';

	try {
		// Build the prompt step by step for clarity
		const prompt = `
You are an AI assistant whose name is **${agentName}**.  
Your purpose is to provide **accurate, helpful, and professional responses** using the given context and chat history.  

### Agent Profile  
${agentDescription}

### Guidelines  
1. Always use the **context** provided to enhance your answer.  
2. If the context does not contain enough information, politely say so and request clarification.  
3. Maintain a **professional, friendly, and approachable tone**.  
4. Keep responses **clear, concise, and directly relevant** to the user’s question.  
5. When helpful, **summarize and structure your answers** (e.g., bullet points, steps).  

### Context  
${context}

### Chat History  
${formattedChatHistory}

### Current User Question  
${question}

---

💡 **Now, provide the best possible response following the above rules** 

${leadInfoSection}
 
`;

		return prompt.trim();
	} catch (error) {
		console.error("Error creating RAG prompt:", error);
		throw new Error("Failed to create RAG prompt");
	}
};

// Generate AI response using RAG
const generateResponse = async (
	agent,
	question,
	relevantContent,
	chatHistory = [],
	leadInfo = {}
) => {
	try {
		// Check if OpenAI is configured
		if (!gpt4o || !gpt4oMini) {
			console.warn("⚠️ OpenAI not configured - returning fallback response");
			return {
				response:
					"I'm sorry, but I'm currently unable to process your request as the AI service is not configured. Please contact the administrator.",
				tokenUsage: {
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
				},
				cost: 0,
				modelUsed: "none",
				relevantSources: 0,
				contextUsed: false,
			};
		}

		// Prepare context from relevant content
		const context =
			relevantContent.length > 0
				? relevantContent.map((item) => item.content).join("\n\n")
				: "No specific context found in the knowledge base.";

		// Prepare chat history
		const formattedChatHistory = chatHistory
			.map((msg) => `${msg.role}: ${msg.message}`)
			.join("\n");

		// Create the prompt
		const prompt = await createRagPrompt(
			agent.name,
			agent.description,
			context,
			formattedChatHistory,
			question,
			leadInfo
		);
// Write prompt to file
try {
    fs.writeFileSync('prompt.txt', prompt);
    console.log('✅ Prompt written to prompt.txt successfully');
} catch (error) {
    console.error('❌ Error writing prompt to file:', error.message);
}

		// Determine which model to use based on complexity
		const model = shouldUseGPT4o(question, context) ? gpt4o : gpt4oMini;
		const modelName = model === gpt4o ? "gpt-4o" : "gpt-4o-mini";

		console.log(`🧠 Using model: ${modelName}`);

		// Generate response
		const response = await model.invoke(prompt);
		console.log("Generated response:", response);
		// Calculate token usage and cost
		const tokenUsage = tokenCounter.calculateChatTokenUsage(
			[{ role: "system", content: prompt }],
			response,
			modelName
		);

		const cost = calculateCost(
			tokenUsage.inputTokens,
			tokenUsage.outputTokens,
			modelName
		);

		console.log(
			`💰 Token usage - Input: ${tokenUsage.inputTokens}, Output: ${
				tokenUsage.outputTokens
			}, Cost: $${cost.toFixed(6)}`
		);

		return {
			response,
			tokenUsage,
			cost,
			modelUsed: modelName,
			relevantSources: relevantContent.length,
			contextUsed: context.length > 0,
		};
	} catch (error) {
		console.error("❌ Error generating RAG response:", error.message);
		throw error;
	}
};

// Extract lead information from conversation
const extractLeadInfo = async (conversation) => {
	try {
		console.log("🔍 Extracting lead information from conversation");

		if (!gpt4oMini) {
			console.warn("⚠️ OpenAI not configured - skipping lead extraction");
			return null;
		}

		const prompt = await this.leadExtractionPrompt.format({
			conversation: conversation,
		});

		const response = await gpt4oMini.invoke([
			{ role: "system", content: prompt },
		]);

		// Parse the JSON response
		let leadData;
		try {
			leadData = JSON.parse(response.content);
		} catch (parseError) {
			console.warn("⚠️ Failed to parse lead extraction response as JSON");
			return null;
		}

		// Clean and validate the extracted data
		const cleanedData = {
			name: cleanName(leadData.name),
			mobile: cleanmobile(leadData.mobile),
			email: cleanEmail(leadData.email),
			followUpDate: cleanDate(leadData.followUp),
		};

		// Only return if we have at least name or contact info
		if (cleanedData.name || cleanedData.mobile || cleanedData.email) {
			console.log("✅ Lead information extracted successfully");
			return cleanedData;
		}

		return null;
	} catch (error) {
		console.error("❌ Error extracting lead info:", error.message);
		return null;
	}
};

// Determine if we should use GPT-4o for complex queries
const shouldUseGPT4o = (question, context) => {
	const complexityIndicators = [
		"analyze",
		"compare",
		"explain in detail",
		"complex",
		"technical",
		"calculate",
		"recommend",
		"strategy",
		"detailed analysis",
	];

	const questionLower = question.toLowerCase();
	const hasComplexityIndicator = complexityIndicators.some((indicator) =>
		questionLower.includes(indicator)
	);

	const isLongContext = context.length > 2000;
	const isLongQuestion = question.length > 200;

	return hasComplexityIndicator || isLongContext || isLongQuestion;
};

// Clean and validate name
const cleanName = (name) => {
	if (!name || typeof name !== "string") return null;
	const cleaned = name.trim().replace(/[^a-zA-Z\s'-]/g, "");
	return cleaned.length >= 2 ? cleaned : null;
};

// Clean and validate mobile number
const cleanmobile = (mobile) => {
	if (!mobile || typeof mobile !== "string") return null;
	const cleaned = mobile.replace(/[^\d+()-\s]/g, "").trim();
	return cleaned.length >= 10 ? cleaned : null;
};

// Clean and validate email
const cleanEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleaned = email.trim().toLowerCase();
    return emailRegex.test(cleaned) ? cleaned : null;
}

// Clean and validate date
const cleanDate = (date) => {
    if (!date || typeof date !== 'string') return null;
    try {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) return null;
      
      // Only accept future dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (parsedDate < today) return null;
      
      return parsedDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch (error) {
      return null;
    }
}

// Generate a summary of the conversation
const generateConversationSummary = async (messages) => {
    try {
      if (!messages || messages.length === 0) {
        return 'No conversation to summarize';
      }
      
      if (!gpt4oMini) {
        console.warn('⚠️ OpenAI not configured - skipping conversation summary');
        return 'Summary unavailable - AI service not configured';
      }
      
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
      
      const prompt = `Please provide a brief summary of this conversation in 2-3 sentences:

${conversationText}

Summary:`;
      
      const response = await gpt4oMini.invoke([
        { role: 'user', content: prompt }
      ]);
      
      return response.content.trim();
    } catch (error) {
      console.error('❌ Error generating conversation summary:', error.message);
      return 'Unable to generate summary';
    }
}

module.exports = {
	generateResponse,
	extractLeadInfo,
	shouldUseGPT4o,
	cleanName,
	cleanmobile,
	cleanEmail,
	cleanDate,
	generateConversationSummary,
	createRagPrompt,
};