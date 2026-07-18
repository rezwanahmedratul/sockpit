exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE socks5_users (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id         UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        username          VARCHAR(100) NOT NULL,
        password_hash     VARCHAR(255) NOT NULL,
        password_plain    VARCHAR(255),
        port              INTEGER NOT NULL CHECK (port >= 1024 AND port <= 65535),
        max_connections   INTEGER NOT NULL DEFAULT 1 CHECK (max_connections >= 1),
        current_connections INTEGER NOT NULL DEFAULT 0,
        is_active         BOOLEAN NOT NULL DEFAULT true,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE(server_id, username),
        UNIQUE(server_id, port)
    );

    CREATE INDEX idx_socks5_users_server_id ON socks5_users(server_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS socks5_users CASCADE;
  `);
};
