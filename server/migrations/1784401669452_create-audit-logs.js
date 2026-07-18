exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE audit_action AS ENUM (
        'user_login',
        'user_logout',
        'user_created',
        'user_updated',
        'user_deleted',
        'server_registered',
        'server_deleted',
        'socks5_user_created',
        'socks5_user_updated',
        'socks5_user_deleted',
        'install_token_generated',
        'install_script_downloaded'
    );

    CREATE TABLE audit_logs (
        id              BIGSERIAL PRIMARY KEY,
        user_id         UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
        action          audit_action NOT NULL,
        resource_type   VARCHAR(50),
        resource_id     UUID,
        details         JSONB DEFAULT '{}',
        ip_address      INET,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TYPE IF EXISTS audit_action CASCADE;
  `);
};
