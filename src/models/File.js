const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

class File {
  // Create a new file record
  static async create(agentId, fileName, fileUrl) {
    const client = await pool.connect();
    try {
      const id = uuidv4();
      const query = `
        INSERT INTO files (id, agent_id, file_name, file_url)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const result = await client.query(query, [id, agentId, fileName, fileUrl]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all files for an agent
  static async getByAgentId(agentId) {
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

  // Get file by ID
  static async getById(id) {
    const client = await pool.connect();
    try {
      const query = 'SELECT * FROM files WHERE id = $1';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete file
  static async delete(id) {
    const client = await pool.connect();
    try {
      const query = 'DELETE FROM files WHERE id = $1 RETURNING *';
      const result = await client.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete all files for an agent
  static async deleteByAgentId(agentId) {
    const client = await pool.connect();
    try {
      const query = 'DELETE FROM files WHERE agent_id = $1 RETURNING *';
      const result = await client.query(query, [agentId]);
      return result.rows;
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  // Get file count for an agent
  static async getCountByAgentId(agentId) {
    const client = await pool.connect();
    try {
      const query = 'SELECT COUNT(*) as count FROM files WHERE agent_id = $1';
      const result = await client.query(query, [agentId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = File;