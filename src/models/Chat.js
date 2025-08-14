const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Chat {
  // Create a new chat session
  static async create(agentId, clientId = null) {
    const client = await pool.connect();
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO chats (id, agent_id, client_id, messages, token_count, cost_usd)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await client.query(query, [id, agentId, clientId, JSON.stringify([]), 0, 0.00]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get chat by ID
  static async getById(id) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT c.*, l.name as client_name, l.email as client_email, l.phone as client_phone
        FROM chats c
        LEFT JOIN leads l ON c.client_id = l.id
        WHERE c.id = $1
      `;
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update chat with new message
  static async addMessage(chatId, message, tokenCount = 0, cost = 0) {
    const client = await pool.connect();
    try {
      // Get current chat
      const getCurrentQuery = 'SELECT messages, token_count, cost_usd FROM chats WHERE id = $1';
      const currentResult = await client.query(getCurrentQuery, [chatId]);
      
      if (currentResult.rows.length === 0) {
        throw new Error('Chat not found');
      }

      const currentChat = currentResult.rows[0];
      const currentMessages = currentChat.messages || [];
      const currentTokenCount = currentChat.token_count || 0;
      const currentCost = parseFloat(currentChat.cost_usd) || 0;

      // Add new message with timestamp
      const newMessage = {
        ...message,
        timestamp: new Date().toISOString()
      };
      
      const updatedMessages = [...currentMessages, newMessage];
      const updatedTokenCount = currentTokenCount + tokenCount;
      const updatedCost = currentCost + cost;

      // Update chat
      const updateQuery = `
        UPDATE chats 
        SET messages = $2, token_count = $3, cost_usd = $4
        WHERE id = $1
        RETURNING *
      `;
      const result = await client.query(updateQuery, [
        chatId, 
        JSON.stringify(updatedMessages), 
        updatedTokenCount, 
        updatedCost
      ]);
      
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Link chat to a lead
  static async linkToLead(chatId, leadId) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE chats 
        SET client_id = $2
        WHERE id = $1
        RETURNING *
      `;
      const result = await client.query(query, [chatId, leadId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all chats for an agent
  static async getByAgentId(agentId, limit = 50, offset = 0) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT c.*, l.name as client_name, l.email as client_email, l.phone as client_phone
        FROM chats c
        LEFT JOIN leads l ON c.client_id = l.id
        WHERE c.agent_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await client.query(query, [agentId, limit, offset]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get chat statistics for an agent
  static async getStatsByAgentId(agentId, startDate = null, endDate = null) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          COUNT(*) as total_chats,
          SUM(token_count) as total_tokens,
          SUM(cost_usd) as total_cost,
          AVG(cost_usd) as avg_cost_per_chat,
          AVG(token_count) as avg_tokens_per_chat
        FROM chats 
        WHERE agent_id = $1
      `;
      const params = [agentId];

      if (startDate && endDate) {
        query += ` AND created_at BETWEEN $2 AND $3`;
        params.push(startDate, endDate);
      }

      const result = await client.query(query, params);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete chat
  static async delete(id) {
    const client = await pool.connect();
    try {
      const query = 'DELETE FROM chats WHERE id = $1 RETURNING *';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get recent chats across all agents (for admin dashboard)
  static async getRecent(limit = 10) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT c.*, a.name as agent_name, l.name as client_name, l.email as client_email
        FROM chats c
        JOIN agents a ON c.agent_id = a.id
        LEFT JOIN leads l ON c.client_id = l.id
        ORDER BY c.created_at DESC
        LIMIT $1
      `;
      const result = await client.query(query, [limit]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Chat;