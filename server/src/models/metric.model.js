const db = require('../config/database');

class MetricModel {
  static async create({ serverId, cpuUsage, memoryUsage, bandwidthIn, bandwidthOut, activeConnections }) {
    const res = await db.query(
      `INSERT INTO server_metrics (server_id, cpu_usage, memory_usage, bandwidth_in, bandwidth_out, active_connections)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, recorded_at`,
      [serverId, cpuUsage, memoryUsage, bandwidthIn, bandwidthOut, activeConnections]
    );
    return res.rows[0];
  }

  static async findHistory(serverId, range = '1h', interval = '1m') {
    // Determine the starting point of range
    let intervalStr;
    switch (range) {
      case '6h':
        intervalStr = '6 hours';
        break;
      case '24h':
        intervalStr = '24 hours';
        break;
      case '7d':
        intervalStr = '7 days';
        break;
      case '1h':
      default:
        intervalStr = '1 hour';
        break;
    }

    // Determine the rollup bucket step
    let step;
    switch (interval) {
      case '5m':
        step = '5 minutes';
        break;
      case '1h':
        step = '1 hour';
        break;
      case '1m':
      default:
        step = '1 minute';
        break;
    }

    // SQL aggregates averages and sum of bandwidth differences grouped by time bucket
    const res = await db.query(
      `SELECT 
         time_bucket as timestamp,
         ROUND(AVG(cpu_usage)::numeric, 1) as cpu_usage,
         ROUND(AVG(memory_usage)::numeric, 1) as memory_usage,
         COALESCE(SUM(bandwidth_in), 0)::bigint as bandwidth_in,
         COALESCE(SUM(bandwidth_out), 0)::bigint as bandwidth_out,
         ROUND(AVG(active_connections)::numeric, 0)::int as active_connections
       FROM (
         SELECT 
           date_trunc('minute', recorded_at) - (EXTRACT(minute FROM recorded_at)::int % EXTRACT(minute FROM $3::interval)::int) * interval '1 minute' as time_bucket,
           cpu_usage,
           memory_usage,
           bandwidth_in,
           bandwidth_out,
           active_connections
         FROM server_metrics
         WHERE server_id = $1 AND recorded_at >= NOW() - $2::interval
       ) sub
       GROUP BY time_bucket
       ORDER BY time_bucket ASC`,
      [serverId, intervalStr, step]
    );

    return res.rows;
  }
}

module.exports = MetricModel;
