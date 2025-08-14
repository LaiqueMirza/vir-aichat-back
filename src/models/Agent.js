const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Agent {
  // Create a new agent
  static async create(name, context) {
    const client = await pool.connect();
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO agents (id, name, context)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const result = await client.query(query, [id, name, context]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all agents
  static async getAll() {
    const client = await pool.connect();
    try {
      const query = `
        SELECT a.*, 
               COUNT(f.id) as file_count,
               COUNT(c.id) as chat_count,
               COUNT(l.id) as lead_count
        FROM agents a
        LEFT JOIN files f ON a.id = f.agent_id
        LEFT JOIN chats c ON a.id = c.agent_id
        LEFT JOIN leads l ON a.id = l.agent_id
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `;
      const result = await client.query(query);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get agent by ID
  static async getById(id) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT a.*, 
               COUNT(f.id) as file_count,
               COUNT(c.id) as chat_count,
               COUNT(l.id) as lead_count
        FROM agents a
        LEFT JOIN files f ON a.id = f.agent_id
        LEFT JOIN chats c ON a.id = c.agent_id
        LEFT JOIN leads l ON a.id = l.agent_id
        WHERE a.id = $1
        GROUP BY a.id
      `;
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update agent
  static async update(id, name, context) {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE agents 
        SET name = $2, context = $3
        WHERE id = $1
        RETURNING *
      `;
      const result = await client.query(query, [id, name, context]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete agent
  static async delete(id) {
    const client = await pool.connect();
    try {
      const query = 'DELETE FROM agents WHERE id = $1 RETURNING *';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get agent files
  static async getFiles(agentId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT * FROM files 
        WHERE agent_id = $1 
        ORDER BY created_at DESC
      `;
      const result = await client.query(query, [agentId]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get agent chats
  static async getChats(agentId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT c.*, l.name as client_name, l.email as client_email
        FROM chats c
        LEFT JOIN leads l ON c.client_id = l.id
        WHERE c.agent_id = $1
        ORDER BY c.created_at DESC
      `;
      const result = await client.query(query, [agentId]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get agent leads
  static async getLeads(agentId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT * FROM leads 
        WHERE agent_id = $1 
        ORDER BY created_at DESC
      `;
      const result = await client.query(query, [agentId]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get agent cost summary
  static async getCostSummary(agentId, startDate = null, endDate = null) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT 
          COUNT(*) as total_chats,
          SUM(token_count) as total_tokens,
          SUM(cost_usd) as total_cost,
          AVG(cost_usd) as avg_cost_per_chat
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
}

module.exports = Agent;