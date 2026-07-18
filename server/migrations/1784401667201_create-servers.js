exports.up = (pgm) => {
  pgm.sql(`
    CREATE TYPE server_status AS ENUM ('online', 'offline', 'error', 'installing');
    CREATE TYPE os_type AS ENUM ('windows', 'linux', 'docker');

    CREATE TABLE servers (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id          UUID NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
        hostname          VARCHAR(255),
        ip_address        INET NOT NULL,
        os_type           os_type NOT NULL,
        os_version        VARCHAR(100),
        agent_version     VARCHAR(20),
        agent_token       VARCHAR(128) NOT NULL UNIQUE,
        status            server_status NOT NULL DEFAULT 'installing',
        last_heartbeat    TIMESTAMPTZ,
        install_token_id  UUID REFERENCES install_tokens(id) ON DELETE SET NULL,
        metadata          JSONB DEFAULT '{}',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_servers_owner_id ON servers(owner_id);
    CREATE INDEX idx_servers_status ON servers(status);
    CREATE INDEX idx_servers_agent_token ON servers(agent_token);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS servers CASCADE;
    DROP TYPE IF EXISTS server_status CASCADE;
    DROP TYPE IF EXISTS os_type CASCADE;
  `);
};
