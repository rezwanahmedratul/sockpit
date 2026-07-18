const db = require('../config/database');

class ServerModel {
  static async findById(id) {
    const res = await db.query(
      `SELECT id, owner_id, hostname, ip_address, os_type, os_version, agent_version,
              agent_token, status, last_heartbeat, install_token_id, metadata, created_at, updated_at
       FROM servers WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  static async findByAgentToken(token) {
    const res = await db.query(
      `SELECT id, owner_id, hostname, ip_address, os_type, os_version, agent_version,
              agent_token, status, last_heartbeat, install_token_id, metadata, created_at, updated_at
       FROM servers WHERE agent_token = $1`,
      [token]
    );
    return res.rows[0] || null;
  }
}

module.exports = ServerModel;
