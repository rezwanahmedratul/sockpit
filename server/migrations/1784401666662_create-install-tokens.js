exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE install_tokens (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token           VARCHAR(64) NOT NULL UNIQUE,
        user_id         UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
        label           VARCHAR(255),
        is_used         BOOLEAN NOT NULL DEFAULT false,
        used_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ
    );

    CREATE INDEX idx_install_tokens_token ON install_tokens(token);
    CREATE INDEX idx_install_tokens_user_id ON install_tokens(user_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS install_tokens CASCADE;
  `);
};
