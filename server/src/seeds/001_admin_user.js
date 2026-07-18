const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function seedAdmin() {
  const email = 'admin@sockpit.local';
  const plainPassword = 'changeme123';
  const displayName = 'Administrator';
  const role = 'admin';

  try {
    // Check if admin user already exists
    const checkRes = await db.query('SELECT id FROM dashboard_users WHERE email = $1', [email]);
    if (checkRes.rows.length > 0) {
      console.log(`Admin user ${email} already exists.`);
      return;
    }

    const passwordHash = await bcrypt.hash(plainPassword, 12);
    await db.query(
      `INSERT INTO dashboard_users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)`,
      [email, passwordHash, displayName, role]
    );
    console.log(`Successfully seeded default admin user: ${email} (password: ${plainPassword})`);
  } catch (err) {
    console.error('Error seeding admin user:', err);
  } finally {
    await db.pool.end();
  }
}

seedAdmin();
