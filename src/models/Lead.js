const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class Lead {
  // Create a new lead
  static async create(agentId, name = null, phone = null, email = null, followUp = null) {
    const client = await pool.connect();
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO leads (id, agent_id, name, phone, email, follow_up, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const result = await client.query(query, [id, agentId, name, phone, email, followUp, 'New']);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get lead by ID
  static async getById(id) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT l.*, a.name as agent_name
        FROM leads l
        JOIN agents a ON l.agent_id = a.id
        WHERE l.id = $1
      `;
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Update lead information
  static async update(id, updates) {
    const client = await pool.connect();
    try {
      const allowedFields = ['name', 'phone', 'email', 'follow_up', 'status'];
      const setClause = [];
      const values = [];
      let paramIndex = 2;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key) && updates[key] !== undefined) {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(updates[key]);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        throw new Error('No valid fields to update');
      }

      const query = `
        UPDATE leads 
        SET ${setClause.join(', ')}
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await client.query(query, [id, ...values]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all leads for an agent
  static async getByAgentId(agentId, status = null, limit = 50, offset = 0) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT l.*, a.name as agent_name,
               COUNT(c.id) as chat_count
        FROM leads l
        JOIN agents a ON l.agent_id = a.id
        LEFT JOIN chats c ON l.id = c.client_id
        WHERE l.agent_id = $1
      `;
      const params = [agentId];
      let paramIndex = 2;

      if (status) {
        query += ` AND l.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` 
        GROUP BY l.id, a.name
        ORDER BY l.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all leads (for admin dashboard)
  static async getAll(status = null, limit = 50, offset = 0) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT l.*, a.name as agent_name,
               COUNT(c.id) as chat_count
        FROM leads l
        JOIN agents a ON l.agent_id = a.id
        LEFT JOIN chats c ON l.id = c.client_id
      `;
      const params = [];
      let paramIndex = 1;

      if (status) {
        query += ` WHERE l.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` 
        GROUP BY l.id, a.name
        ORDER BY l.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get lead statistics for an agent
  static async getStatsByAgentId(agentId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'New' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'Contacted' THEN 1 END) as contacted_leads,
          COUNT(CASE WHEN status = 'Follow-up' THEN 1 END) as followup_leads,
          COUNT(CASE WHEN follow_up IS NOT NULL AND follow_up >= CURRENT_DATE THEN 1 END) as upcoming_followups
        FROM leads 
        WHERE agent_id = $1
      `;
      const result = await client.query(query, [agentId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get leads with upcoming follow-ups
  static async getUpcomingFollowUps(agentId = null, days = 7) {
    const client = await pool.connect();
    try {
      let query = `
        SELECT l.*, a.name as agent_name
        FROM leads l
        JOIN agents a ON l.agent_id = a.id
        WHERE l.follow_up IS NOT NULL 
        AND l.follow_up BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'
      `;
      const params = [];

      if (agentId) {
        query += ` AND l.agent_id = $1`;
        params.push(agentId);
      }

      query += ` ORDER BY l.follow_up ASC`;

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete lead
  static async delete(id) {
    const client = await pool.connect();
    try {
      const query = 'DELETE FROM leads WHERE id = $1 RETURNING *';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Find lead by email and agent
  static async findByEmailAndAgent(email, agentId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT * FROM leads 
        WHERE email = $1 AND agent_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const result = await client.query(query, [email, agentId]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Lead;