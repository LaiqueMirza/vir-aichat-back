const { gpt4oMini, calculateCost } = require('../config/openai');
const tokenCounter = require('./tokenCounter');

// Regex-based fallback extraction function
const extractUserInfoRegex = (query) => {
	const userInfo = {};

	// Extract name patterns - improved to capture full names
	const namePatterns = [
		/(?:my name is|i am|i'm|call me)\s+([a-zA-Z\s]{2,30})(?:\s*[,.]|\s+and|\s+you|\s+i|\s*$)/i,
		/(?:myself)\s+([a-zA-Z\s]{2,30})(?:\s*[,.]|\s+and|\s+you|\s+i|\s*$)/i,
		/(?:name:?)\s*([a-zA-Z\s]{2,30})(?:\s*[,.]|\s+email|\s+mobile|\s*$)/i,
	];

	// Extract email patterns
	const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;

	// Extract mobile patterns - improved to handle various formats
	const mobilePatterns = [
		/(?:mobile|number|call|contact)\s*:?\s*([+]?[0-9][\s\-\(\)0-9]{6,20})/i,
		/(?:at|is)\s+([+]?[0-9][\s\-\(\)0-9]{6,20})(?:\s|$)/i,
	];

	// Extract name
	for (const pattern of namePatterns) {
		const match = query.match(pattern);
		if (match && match[1]) {
			const name = match[1].trim().replace(/\s+/g, " ");
			if (name.length > 1 && !name.toLowerCase().includes("at")) {
				userInfo.name = name;
				break;
			}
		}
	}

	// Extract email
	const emailMatch = query.match(emailPattern);
	if (emailMatch && emailMatch[1]) {
		userInfo.email = emailMatch[1].trim();
	}

	// Extract mobile
	for (const pattern of mobilePatterns) {
		const match = query.match(pattern);
		if (match && match[1]) {
			const mobile = match[1].replace(/[^+0-9]/g, "");
			if (mobile.length >= 7 && mobile.length <= 15) {
				userInfo.mobile = mobile;
				break;
			}
		}
	}

	return userInfo;
};

// Extract user information using OpenAI's sophisticated analysis
const extractUserInfoWithAI = async (query) => {
	try {
		if (!gpt4oMini) {
			console.warn(
				"⚠️ OpenAI not configured - falling back to regex extraction"
			);
			return null;
		}

		const userInfoPrompt = `Please analyze the following text and extract user information. Focus on:
1. Full name (including titles, first name, last name)
2. Email addresses (validate format)
3. mobile numbers (any format, including international)
4. Any additional contact details or preferences
5. Context of why they are reaching out

Text to analyze: "${query}"

Return only a valid JSON object with the following structure:
{
  "name": "string or null",
  "email": "string or null",
  "mobile": "string or null",
  "additionalInfo": {
    "title": "string or null",
    "preferredContact": "string or null",
    "context": "string or null"
  }
}`;

		// Use LangChain's invoke method with proper message format
		const systemMessage =
			"You are a helpful assistant that extracts user information from text. Only return valid JSON.";
		const fullPrompt = `${systemMessage}\n\n${userInfoPrompt}`;

		// Count input tokens
		const inputTokens = tokenCounter.countTokens(fullPrompt, 'gpt-4o-mini');

		const response = await gpt4oMini.invoke(fullPrompt);

		// Count output tokens
		const outputTokens = tokenCounter.countTokens(response, 'gpt-4o-mini');
		const totalTokens = inputTokens + outputTokens;

		// Calculate cost
		const cost = calculateCost(inputTokens, outputTokens, 'gpt-4o-mini');

		let userInfo = {};
		try {
			userInfo = JSON.parse(response);
			console.log("✅ Successfully extracted user info with OpenAI:", userInfo);
			console.log(`💰 AI extraction tokens: ${totalTokens}, cost: $${cost.toFixed(6)}`);

			// Add token usage and cost to the response
			return {
				...userInfo,
				tokenUsage: {
					inputTokens,
					outputTokens,
					totalTokens
				},
				cost
			};
		} catch (error) {
			console.warn("Failed to parse OpenAI user info response:", error.message);
			return null;
		}
	} catch (error) {
		console.error("❌ Error extracting user info with OpenAI:", error.message);
		return null;
	}
};

module.exports = {
  extractUserInfoWithAI,
  extractUserInfoRegex
};