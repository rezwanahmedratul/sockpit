exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE user_role AS ENUM ('admin', 'user');

    CREATE TABLE dashboard_users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) NOT NULL UNIQUE,
        password_hash   VARCHAR(255) NOT NULL,
        display_name    VARCHAR(100) NOT NULL,
        role            user_role NOT NULL DEFAULT 'user',
        is_active       BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_dashboard_users_email ON dashboard_users(email);
    CREATE INDEX idx_dashboard_users_role ON dashboard_users(role);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS dashboard_users CASCADE;
    DROP TYPE IF EXISTS user_role CASCADE;
  `);
};
