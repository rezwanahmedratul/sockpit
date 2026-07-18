exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE server_metrics (
        id                  BIGSERIAL PRIMARY KEY,
        server_id           UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        cpu_usage           REAL,
        memory_usage        REAL,
        bandwidth_in        BIGINT,
        bandwidth_out       BIGINT,
        active_connections  INTEGER,
        recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_server_metrics_server_id ON server_metrics(server_id);
    CREATE INDEX idx_server_metrics_recorded_at ON server_metrics(recorded_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS server_metrics CASCADE;
  `);
};
