const { Server } = require('socket.io');
const { getSupabaseClient } = require('../config/supabase');
const ragService = require('./ragService');
const embeddingsService = require('./embeddingsService');
const elevenLabsService = require('./elevenLabsService');
const costService = require('./costService');
const ChatSupabase = require('../models/ChatSupabase');
const AgentSupabase = require('../models/AgentSupabase');
const LeadSupabase = require('../models/LeadSupabase');
const Chat = require('../models/Chat');

class WebSocketChatService {
	constructor(server) {
		this.io = new Server(server, {
			cors: {
				origin: process.env.FRONTEND_URL || "http://localhost:3000",

				methods: ["GET", "POST"],
				credentials: true,
			},
			transports: ["websocket", "polling"],
			allowEIO3: true,
		});

		this.sessions = new Map(); // Store active chat sessions
		this.setupEventHandlers();
	}

	setupEventHandlers() {
		this.io.on("connection", (socket) => {
			console.log(`🔗 WebSocket client connected: ${socket.id}`);

			// Handle chat session initialization
			socket.on("join-chat", async (data) => {
				try {
					const { agentId, chatId, leadId } = data;

					// Store session info
					this.sessions.set(socket.id, {
						agentId,
						chatId,
						leadId,
						socketId: socket.id,
					});

					// Join room for this chat
					socket.join(`chat-${chatId}`);

					console.log(
						`👤 Client ${socket.id} joined chat ${chatId} for agent ${agentId}`
					);

					socket.emit("chat-joined", {
						success: true,
						chatId,
						agentId,
					});
				} catch (error) {
					console.error("❌ Error joining chat:", error);
					socket.emit("error", { message: "Failed to join chat" });
				}
			});

			// Handle voice message streaming
			socket.on("voice-message", async (data) => {
				try {
					await this.handleVoiceMessage(socket, data);
				} catch (error) {
					console.error("❌ Error handling voice message:", error);
					socket.emit("error", {
						message: "Failed to process voice message",
						error: error.message,
					});
				}
			});

			// Handle chat message streaming
			socket.on("chat-message", async (data) => {
				try {
					await this.handleChatMessage(socket, data);
				} catch (error) {
					console.error("❌ Error handling chat message:", error);
					socket.emit("error", {
						message: "Failed to process chat message",
						error: error.message,
					});
				}
			});

			// Handle send-message event (new implementation)
			socket.on("send-message", async (data) => {
				try {
					console.log("📨 Received send-message event:", data);
					await this.handleSendMessage(socket, data);
				} catch (error) {
					console.error("❌ Error handling send-message:", error);
					socket.emit("error", {
						message: "Failed to process send-message",
						error: error.message,
					});
				}
			});

			// Handle disconnection
      socket.on("disconnect", () => {
        
				console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
				this.sessions.delete(socket.id);
			});
		});
	}

	// Helper method to get recent chat history for WebSocket
	async getRecentChatHistory(chat_id, limit = 5) {
		try {
			if (!chat_id) return [];

			const { data, error } = await getSupabaseClient()
				.from("chat_logs")
				.select("*")
				.eq("chat_id", chat_id)
				.order("created_at", { ascending: false })
				.limit(limit);

			if (error) throw error;

			// Return in chronological order and format for RAG service
			return data.reverse().map((log) => ({
				role: log.role,
				message: log.message,
			}));
		} catch (error) {
			console.error("❌ Error fetching chat history:", error);
			return [];
		}
	}

	async handleSendMessage(socket, data) {
    try {
			const { message, sender, chat_id, agent_id, requestAudio } = data;

			if (!message) {
				socket.emit("error", {
					error: "Validation error",
					message: "Message is required",
				});
				return;
			}

			// Emit acknowledgment
			socket.emit("message-received", {
				messageId: Date.now(),
				status: "processing",
			});

			// Get chat details to extract lead_id
			const chat = await Chat.getById(chat_id);
			const lead_id = chat ? chat.lead_id : null;

			// Get relevant context using RAG
			const embeddingResult = await embeddingsService.searchRelevantContent(
				agent_id,
				message,
				lead_id
			);
			console.log("embeddingResult", embeddingResult);

			// Extract relevant content and costs
			const relevantContent = embeddingResult.results || embeddingResult;
			const embeddingTokens = embeddingResult.tokenUsage?.totalTokens || 0;
			const embeddingCost = embeddingResult.cost || 0;

			// Generate AI response
			const agent = await AgentSupabase.getById(agent_id);
			const chatHistory = await this.getRecentChatHistory(chat_id);

			// Get lead info
			const leadInfo = await LeadSupabase.getById(
				lead_id,
				"name, email, mobile"
			);

			// Generate streaming AI response
			let fullResponse = "";
			let tokenCount = 0;
			let audioBuffer = ""; // Buffer to accumulate words for TTS
			let audioWordCount = 0; // Track words in buffer
			let wordLimitForTTS = 3; // Minimum words required for TTS

			// Start streaming response
			console.log("🚀 Starting streaming response generation...");
			const streamGenerator = ragService.getStreamingResponse(
				agent,
				message,
				relevantContent,
				chatHistory,
				leadInfo,
				requestAudio
			);

			console.log("🔄 Beginning to process streaming chunks...");

			// Process streaming chunks
			for await (const chunk of streamGenerator) {
				console.log("📦 Received chunk:", JSON.stringify(chunk, null, 2));

				if (chunk.choices?.[0]?.delta?.content) {
					const content = chunk.choices[0].delta.content;
					fullResponse += content;

					console.log("✅ Emitting chunk content:", content);

					// Handle audio buffering if requested
					if (requestAudio && elevenLabsService.isConfigured()) {
						// Filter out special characters and newlines before adding to audio buffer
						const cleanContent = content
							.replace(/[^\w\s.,!?;:-]/g, "")
							.replace(/\n/g, " ")
							.trim();

						// Only add to buffer if there's meaningful content after filtering
						if (cleanContent.length > 0) {
							audioBuffer += cleanContent + " ";

							// Count words in the buffer (simple word count by splitting on whitespace)
							const words = audioBuffer
								.trim()
								.split(/\s+/)
								.filter((word) => word.length > 0);
							audioWordCount = words.length;

							console.log(
								`📝 Audio buffer now has ${audioWordCount} words: "${audioBuffer.substring(
									0,
									50
								)}${audioBuffer.length > 50 ? "..." : ""}"`
							);

							// Send to ElevenLabs if we have 5 or more words
							if (audioWordCount >= wordLimitForTTS) {
								const textToSpeak = audioBuffer.trim();
								console.log(
									`🎵 Sending ${audioWordCount} words to ElevenLabs: "${textToSpeak.substring(
										0,
										100
									)}${textToSpeak.length > 100 ? "..." : ""}"`
								);

								// Clear the buffer
								audioBuffer = "";
								audioWordCount = 0;

								// Generate TTS asynchronously
								try {
									const audioData = await elevenLabsService.textToSpeechStream(
										textToSpeak
									);
									if (audioData) {
										console.log(
											"🎵 Generated TTS for word chunk, emitting audio..."
										);
										socket.emit("message-audio-chunk", {
											success: true,
											data: {
												audio: audioData,
												text: textToSpeak,
											},
										});
									}
									wordLimitForTTS++; // Gradually increase word limit to reduce API calls
								} catch (ttsError) {
									console.error(
										"❌ TTS generation failed for word chunk:",
										ttsError.message
									);
								}
							}
						}
					} else if (requestAudio && !elevenLabsService.isConfigured()) {
						console.warn("⚠️ TTS requested but ElevenLabs not configured");
					} else {
						socket.emit("message-chunk-response", {
							success: true,
							data: {
								response: content,
								audio: null, // Audio will come separately if requested
							},
						});
					}
				} else {
					console.log("⚠️ Chunk does not have expected structure");
				}
			}

			console.log(
				"🏁 Streaming completed. Full response length:",
				fullResponse.length
			);

			// Handle remaining words in audio buffer (edge case for last chunk)
			if (
				requestAudio &&
				elevenLabsService.isConfigured() &&
				audioBuffer.trim().length > 0
			) {
				const remainingText = audioBuffer.trim();
				const remainingWords = remainingText
					.split(/\s+/)
					.filter((word) => word.length > 0);

				console.log(
					`🎵 Processing final ${remainingWords.length} remaining words: "${remainingText}"`
				);

				// Send remaining text to ElevenLabs (even if less than 5 words)
				try {
					const audioData = await elevenLabsService.textToSpeechStream(
						remainingText
					);
					if (audioData) {
						console.log("🎵 Generated TTS for word chunk, emitting audio...");
						socket.emit("message-audio-chunk", {
							success: true,
							data: {
								audio: audioData,
								text: remainingText,
							},
						});
					}
				} catch (ttsError) {
					console.error(
						"❌ TTS generation failed for word chunk:",
						ttsError.message
					);
				}
			}

			// Store user message
			const { data: userData, error: userError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id,
					role: sender,
					message,
					total_tokens: 0,
					total_cost: 0,
				})
				.select()
				.single();

			if (userError) throw userError;
			// Calculate approximate token usage (rough estimate)
			tokenCount = Math.ceil(fullResponse.length / 4);
			const estimatedCost = tokenCount * 0.0001; // Rough estimate

			// Calculate total tokens and cost including embeddings
			const totalResponseTokens = tokenCount + embeddingTokens;
			const totalResponseCost = estimatedCost + embeddingCost;

			// Store AI response
			const { data: aiData, error: aiError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id: chat_id,
					message: fullResponse,
					role: "assistant",
					total_tokens: totalResponseTokens,
					total_cost: totalResponseCost,
				})
				.select()
				.single();

			if (aiError) throw aiError;

			// Update chat total_tokens and total_cost
			const chatDataForUpdate = await ChatSupabase.getById(chat_id);
			const total_tokens = chatDataForUpdate.total_tokens + totalResponseTokens;
			const total_cost = chatDataForUpdate.total_cost + totalResponseCost;

			await ChatSupabase.update(chat_id, {
				total_tokens,
				total_cost,
			});

			// Emit final complete response to frontend
			socket.emit("message-response", {
				success: true,
				data: {
					response: fullResponse,
					audio: null,
					tokensUsed: {
						ai: tokenCount,
						embedding: embeddingTokens,
						total: totalResponseTokens,
					},
					cost: {
						ai: estimatedCost,
						embedding: embeddingCost,
						total: totalResponseCost,
					},
				},
			});
		} catch (error) {
			console.error("❌ Error processing send-message:", error.message);
			socket.emit("error", {
				error: "Failed to process message",
				message: error.message,
			});
		}
	}

	async handleVoiceMessage(socket, data) {
		const session = this.sessions.get(socket.id);
		if (!session) {
			socket.emit("error", { message: "Session not found" });
			return;
		}

		const { message, audioData } = data;
		const { agentId, chatId, leadId } = session;

		// Emit immediate acknowledgment
		socket.emit("message-received", {
			messageId: Date.now(),
			status: "processing",
		});

		try {
			// Get agent information
			const agent = await AgentSupabase.getById(agentId);
			if (!agent) {
				throw new Error("Agent not found");
			}

			// Save user message to chat_logs table
			const { data: userMessage, error: userError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id: chatId,
					role: "user",
					message,
					total_tokens: 0,
					total_cost: 0,
				})
				.select()
				.single();

			if (userError) throw userError;

			// Process with RAG service and stream response
			await this.streamAIResponse(socket, {
				message,
				agent,
				chatId,
				leadId,
				userMessageId: userMessage.chat_log_id,
				requestAudio: true,
			});
		} catch (error) {
			console.error("❌ Error in handleVoiceMessage:", error);
			socket.emit("error", {
				message: "Failed to process voice message",
				error: error.message,
			});
		}
	}

	async handleChatMessage(socket, data) {
		console.log("📨 Received chat message:", data);

		const { query, agentId, leadId, voiceEnabled, sessionId } = data;

		// Store session info if not exists
		if (!this.sessions.has(socket.id)) {
			this.sessions.set(socket.id, {
				agentId,
				chatId: sessionId || Date.now().toString(),
				leadId,
				socketId: socket.id,
			});
		}

		const session = this.sessions.get(socket.id);
		const { chatId } = session;

		// Emit immediate acknowledgment
		socket.emit("message-received", {
			messageId: Date.now(),
			status: "processing",
		});

		try {
			// Get agent information
			const agent = await AgentSupabase.getById(agentId);
			if (!agent) {
				throw new Error("Agent not found");
			}

			// Save user message to chat_logs table
			const { data: userMessage, error: userError } = await getSupabaseClient()
				.from("chat_logs")
				.insert({
					chat_id: chatId,
					role: "user",
					message: query,
					total_tokens: 0,
					total_cost: 0,
				})
				.select()
				.single();

			if (userError) throw userError;

			// Process with RAG service and stream response
			await this.streamAIResponse(socket, {
				message: query,
				agent,
				chatId,
				leadId,
				userMessageId: userMessage.chat_log_id,
				requestAudio: voiceEnabled || false,
			});
		} catch (error) {
			console.error("❌ Error in handleChatMessage:", error);
			socket.emit("error", {
				message: "Failed to process chat message",
				error: error.message,
			});
		}
	}

	async streamAIResponse(socket, options) {
		const { message, agent, chatId, leadId, userMessageId, requestAudio } =
			options;

		try {
			let fullResponse = "";
			const startTime = Date.now();

			// Initialize streaming response
			socket.emit("responseStart", {
				messageId: Date.now(),
				timestamp: new Date().toISOString(),
			});

			// Stream text response from RAG service
			const responseStream = await ragService.getStreamingResponse(
				message,
				agent.agent_id,
				agent.name,
				agent.description,
				await this.getChatHistory(chatId)
			);

			// Process streaming chunks
			for await (const chunk of responseStream) {
				if (chunk.choices?.[0]?.delta?.content) {
					const textChunk = chunk.choices[0].delta.content;
					fullResponse += textChunk;

					// Emit text chunk to frontend
					socket.emit("textChunk", {
						chunk: textChunk,
						timestamp: Date.now(),
					});

					// If audio is requested, convert text chunk to speech and stream
					if (requestAudio && textChunk.length > 50) {
						// Wait for meaningful chunks
						try {
							const audioChunk = await elevenLabsService.textToSpeechStream(
								textChunk,
								agent.voice_id
							);
							if (audioChunk) {
								socket.emit("audioChunk", {
									audioData: audioChunk,
									timestamp: Date.now(),
								});
							}
						} catch (audioError) {
							console.error(
								"⚠️  Audio generation failed for chunk:",
								audioError.message
							);
							// Continue without audio for this chunk
						}
					}
				}
			}

			// Generate final audio for complete response if needed
			if (requestAudio && fullResponse && fullResponse.length <= 50) {
				try {
					const finalAudio = await elevenLabsService.textToSpeechStream(
						fullResponse,
						agent.voice_id
					);
					if (finalAudio) {
						socket.emit("audioChunk", {
							audioData: finalAudio,
							timestamp: Date.now(),
						});
					}
				} catch (audioError) {
					console.error(
						"⚠️  Final audio generation failed:",
						audioError.message
					);
				}
			}

			// Save assistant response to chat_logs table
			const { data: assistantMessage, error: assistantError } =
				await getSupabaseClient()
					.from("chat_logs")
					.insert({
						chat_id: chatId,
						role: "assistant",
						message: fullResponse,
						total_tokens: Math.ceil(fullResponse.length / 4), // Rough token estimate
						total_cost: 0.0001, // Placeholder cost
					})
					.select()
					.single();

			if (assistantError) throw assistantError;

			// Calculate costs
			const endTime = Date.now();
			const responseTime = endTime - startTime;

			await costService.trackCost({
				agent_id: agent.agent_id,
				lead_id: leadId,
				chat_id: chatId,
				message_count: 1,
				tokens_used: fullResponse.length / 4, // Rough estimate
				cost_usd: 0.0001, // Placeholder
				response_time_ms: responseTime,
			});

			// Emit completion
			socket.emit("messageComplete", {
				messageId: assistantMessage.chat_log_id,
				fullResponse,
				responseTime,
				timestamp: new Date().toISOString(),
			});

			// Also emit audio completion if audio was requested
			if (requestAudio) {
				socket.emit("audioComplete", {
					status: "complete",
					timestamp: new Date().toISOString(),
				});
			}
		} catch (error) {
			console.error("❌ Error in streamAIResponse:", error);
			socket.emit("error", {
				message: "Failed to generate AI response",
				error: error.message,
			});
		}
	}

	// Method to broadcast to all clients in a chat
	broadcastToChat(chatId, event, data) {
		this.io.to(`chat-${chatId}`).emit(event, data);
	}

	// Get active sessions count
	getActiveSessionsCount() {
		return this.sessions.size;
	}

	// Get session info
	getSessionInfo(socketId) {
		return this.sessions.get(socketId);
	}

	// Helper method to get chat history
	async getChatHistory(chatId, limit = 10) {
		try {
			if (!chatId) return [];

			const { data, error } = await getSupabaseClient()
				.from("chat_logs")
				.select("*")
				.eq("chat_id", chatId)
				.order("created_at", { ascending: false })
				.limit(limit);

			if (error) throw error;

			// Return in chronological order and format for RAG service
			return data.reverse().map((log) => ({
				role: log.role,
				content: log.message,
			}));
		} catch (error) {
			console.error(
				"❌ Error fetching chat history for streaming:",
				error.message
			);
			return [];
		}
	}
}

// Global instance for access from other modules
let globalWebSocketService = null;

// Export class and helper functions
module.exports = WebSocketChatService;
module.exports.setWebSocketService = (instance) => {
	globalWebSocketService = instance;
};
module.exports.getWebSocketService = () => {
	return globalWebSocketService;
};
