exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE connection_logs (
        id                BIGSERIAL PRIMARY KEY,
        server_id         UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        socks5_user_id    UUID REFERENCES socks5_users(id) ON DELETE SET NULL,
        client_ip         INET,
        target_host       VARCHAR(255),
        target_port       INTEGER,
        bytes_sent        BIGINT DEFAULT 0,
        bytes_received    BIGINT DEFAULT 0,
        connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        disconnected_at   TIMESTAMPTZ,
        status            VARCHAR(20) DEFAULT 'active'
    );

    CREATE INDEX idx_connection_logs_server_id ON connection_logs(server_id);
    CREATE INDEX idx_connection_logs_socks5_user_id ON connection_logs(socks5_user_id);
    CREATE INDEX idx_connection_logs_connected_at ON connection_logs(connected_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS connection_logs CASCADE;
  `);
};
