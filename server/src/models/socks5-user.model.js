const db = require('../config/database');

class Socks5UserModel {
  static async findById(id) {
    const res = await db.query(
      `SELECT id, server_id, username, password_hash, password_plain, port, max_connections, current_connections, is_active, created_at, updated_at
       FROM socks5_users WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  static async findByServerAndUsername(serverId, username) {
    const res = await db.query(
      `SELECT id, server_id, username, password_hash, password_plain, port, max_connections, current_connections, is_active, created_at, updated_at
       FROM socks5_users WHERE server_id = $1 AND username = $2`,
      [serverId, username]
    );
    return res.rows[0] || null;
  }

  static async findByServerAndPort(serverId, port) {
    const res = await db.query(
      `SELECT id, server_id, username, password_hash, password_plain, port, max_connections, current_connections, is_active, created_at, updated_at
       FROM socks5_users WHERE server_id = $1 AND port = $2`,
      [serverId, port]
    );
    return res.rows[0] || null;
  }

  static async create({ serverId, username, passwordHash, passwordPlain, port, maxConnections = 1 }) {
    const res = await db.query(
      `INSERT INTO socks5_users (server_id, username, password_hash, password_plain, port, max_connections)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, server_id, username, port, max_connections, current_connections, is_active, created_at`,
      [serverId, username, passwordHash, passwordPlain, port, maxConnections]
    );
    return res.rows[0];
  }

  static async update(id, { passwordHash, passwordPlain, port, maxConnections, isActive }) {
    const res = await db.query(
      `UPDATE socks5_users
       SET password_hash = COALESCE($2, password_hash),
           password_plain = COALESCE($3, password_plain),
           port = COALESCE($4, port),
           max_connections = COALESCE($5, max_connections),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, server_id, username, port, max_connections, current_connections, is_active, updated_at`,
      [id, passwordHash, passwordPlain, port, maxConnections, isActive]
    );
    return res.rows[0] || null;
  }

  static async delete(id) {
    const res = await db.query(
      'DELETE FROM socks5_users WHERE id = $1 RETURNING id, server_id, username, port',
      [id]
    );
    return res.rows[0] || null;
  }
}

module.exports = Socks5UserModel;
