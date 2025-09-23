const axios = require('axios');

class ElevenLabsService {
	constructor() {
		this.apiKey = process.env.ELEVENLABS_API_KEY;
		this.baseUrl = "https://api.elevenlabs.io/v1";
		this.voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // Default voice ID

		if (!this.apiKey) {
			console.warn("⚠️ ElevenLabs API key not configured");
		}
	}

	/**
	 * Convert text to speech using ElevenLabs API
	 * @param {string} text - Text to convert to speech
	 * @param {Object} options - Optional parameters
	 * @returns {Promise<Buffer>} Audio buffer
	 */
	async textToSpeech(text, options = {}) {
		try {
			if (!this.apiKey) {
				throw new Error("ElevenLabs API key not configured");
			}

			if (!text || text.trim().length === 0) {
				throw new Error("Text is required for TTS conversion");
			}

			// Clean text for better TTS output
			const cleanedText = this.cleanTextForTTS(text);

			const requestData = {
				text: cleanedText,
				model_id: options.model_id || "eleven_monolingual_v1",
				voice_settings: {
					stability: options.stability || 0.5,
					similarity_boost: options.similarity_boost || 0.75,
					style: options.style || 0.0,
					use_speaker_boost: options.use_speaker_boost || true,
				},
			};

			console.log(
				`🎵 Converting text to speech: "${cleanedText.substring(0, 50)}${
					cleanedText.length > 50 ? "..." : '"'
				}`
			);

			const response = await axios({
				method: "POST",
				url: `${this.baseUrl}/text-to-speech/${this.voiceId}`,
				headers: {
					Accept: "audio/mpeg",
					"Content-Type": "application/json",
					"xi-api-key": this.apiKey,
				},
				data: requestData,
				responseType: "arraybuffer",
				timeout: 30000, // 30 second timeout
			});

			console.log("✅ TTS conversion successful");
			return Buffer.from(response.data);
		} catch (error) {
			console.error("❌ ElevenLabs TTS Error:", error.message);

			if (error.response) {
				const statusCode = error.response.status;
				const errorData = error.response.data;

				switch (statusCode) {
					case 401:
						throw new Error("Invalid ElevenLabs API key");
					case 422:
						throw new Error("Invalid request parameters for TTS");
					case 429:
						throw new Error("ElevenLabs API rate limit exceeded");
					case 500:
						throw new Error("ElevenLabs API server error");
					default:
						throw new Error(
							`ElevenLabs API error: ${statusCode} - ${errorData}`
						);
				}
			}

			if (error.code === "ECONNABORTED") {
				throw new Error("TTS request timeout - please try again");
			}

			throw error;
		}
	}

	/**
	 * Convert text to speech with streaming support (optimized for chunks)
	 * @param {string} text - Text to convert to speech
	 * @param {string} voiceId - Optional voice ID override
	 * @param {Object} options - Optional parameters
	 * @returns {Promise<string>} Base64 encoded audio
	 */
	async textToSpeechStream(text, voiceId = null, options = {}) {
		try {
			if (!this.apiKey) {
				console.warn("⚠️ ElevenLabs API key not configured - skipping TTS");
				return null;
			}

			if (!text || text.trim().length === 0) {
				return null;
			}

			const cleanedText = this.cleanTextForTTS(text);

			const targetVoiceId = voiceId || this.voiceId;

			const requestData = {
				text: cleanedText,
				model_id: options.model_id || "eleven_turbo_v2", // Use turbo model for faster streaming
				voice_settings: {
					stability: options.stability || 0.5,
					similarity_boost: options.similarity_boost || 0.75,
					style: options.style || 0.0,
					use_speaker_boost: options.use_speaker_boost || true,
				},
				output_format: "mp3_44100_128", // Optimized format for streaming
			};
			const response = await axios({
				method: "POST",
				url: `${this.baseUrl}/text-to-speech/${targetVoiceId}`,
				headers: {
					Accept: "audio/mpeg",
					"Content-Type": "application/json",
					"xi-api-key": this.apiKey,
				},
				data: requestData,
				responseType: "arraybuffer",
				timeout: 15000, // Shorter timeout for chunks
			});

			// Convert to base64 for streaming
			const audioBase64 = Buffer.from(response.data).toString("base64");
			return audioBase64;
		} catch (error) {
			console.error(`❌ Error in streaming TTS: ${error.message}`);
			return null; // Return null instead of throwing to allow graceful degradation
		}
	}

	/**
	 * Clean text for better TTS output
	 * @param {string} text - Raw text
	 * @returns {string} Cleaned text
	 */
	cleanTextForTTS(text) {
		return (
			text
				// Remove markdown formatting
				.replace(/\*\*(.*?)\*\*/g, "$1") // Bold
				.replace(/\*(.*?)\*/g, "$1") // Italic
				.replace(/`(.*?)`/g, "$1") // Code
				.replace(/\[(.*?)\]\(.*?\)/g, "$1") // Links
				// Remove excessive whitespace
				.replace(/\s+/g, " ")
				.trim()
		);
	}

	/**
	 * Get available voices from ElevenLabs
	 * @returns {Promise<Array>} List of available voices
	 */
	async getVoices() {
		try {
			if (!this.apiKey) {
				throw new Error("ElevenLabs API key not configured");
			}

			const response = await axios({
				method: "GET",
				url: `${this.baseUrl}/voices`,
				headers: {
					"xi-api-key": this.apiKey,
				},
			});

			return response.data.voices;
		} catch (error) {
			console.error("❌ Error fetching voices:", error.message);
			throw error;
		}
	}

	/**
	 * Check if ElevenLabs service is properly configured
	 * @returns {boolean} Configuration status
	 */
	isConfigured() {
		return !!this.apiKey;
	}
}

module.exports = new ElevenLabsService();