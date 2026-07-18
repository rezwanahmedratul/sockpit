const db = require('../config/database');

class UserModel {
  static async findById(id) {
    const res = await db.query(
      'SELECT id, email, password_hash, display_name, role, is_active, created_at, updated_at FROM dashboard_users WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  static async findByEmail(email) {
    const res = await db.query(
      'SELECT id, email, password_hash, display_name, role, is_active, created_at, updated_at FROM dashboard_users WHERE email = $1',
      [email]
    );
    return res.rows[0] || null;
  }

  static async create({ email, passwordHash, displayName, role = 'user' }) {
    const res = await db.query(
      `INSERT INTO dashboard_users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role, is_active, created_at`,
      [email, passwordHash, displayName, role]
    );
    return res.rows[0];
  }

  static async update(id, { displayName, role, isActive }) {
    const res = await db.query(
      `UPDATE dashboard_users
       SET display_name = COALESCE($2, display_name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, role, is_active, updated_at`,
      [id, displayName, role, isActive]
    );
    return res.rows[0] || null;
  }

  static async delete(id) {
    const res = await db.query(
      'DELETE FROM dashboard_users WHERE id = $1 RETURNING id',
      [id]
    );
    return res.rows[0] || null;
  }
}

module.exports = UserModel;
