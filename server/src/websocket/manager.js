const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');
const db = require('../config/database');
const redisClient = require('../config/redis');
const ServerModel = require('../models/server.model');
const MetricModel = require('../models/metric.model');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const logger = require('pino')({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

class WebSocketManager {
  constructor() {
    this.wss = null;
    this.agents = new Map(); // serverId -> WebSocket
    this.dashboards = new Map(); // userId -> Set of WebSockets
    this.pubClient = null;
    this.subClient = null;
  }

  async init(server) {
    this.wss = new WebSocketServer({ noServer: true });

    // Setup Redis scaling pub/sub
    this.pubClient = redisClient.duplicate();
    this.subClient = redisClient.duplicate();

    await this.pubClient.connect();
    await this.subClient.connect();

    // Subscribe to multi-instance notifications
    await this.subClient.subscribe('dashboard_events', (message) => {
      const { userId, event } = JSON.parse(message);
      this.localSendToDashboard(userId, event);
    });

    await this.subClient.subscribe('agent_commands', (message) => {
      const { serverId, command } = JSON.parse(message);
      this.localSendToAgent(serverId, command);
    });

    this.wss.on('connection', (ws, request) => {
      logger.info('New WebSocket connection established');
      ws.isAlive = true;
      
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (message) => {
        try {
          const parsed = JSON.parse(message);
          await this.handleMessage(ws, parsed);
        } catch (err) {
          logger.error(err, 'Failed to parse or process WS message');
          ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: 'Invalid message structure or server error' }
          }));
        }
      });

      ws.on('close', () => {
        this.cleanupConnection(ws);
      });

      ws.on('error', (err) => {
        logger.error(err, 'WebSocket error occurred');
        this.cleanupConnection(ws);
      });
    });

    // Handle WebSocket upgrade
    server.on('upgrade', (request, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });

    // Start heartbeat interval (30s check)
    this.startHeartbeatInterval();
    logger.info('WebSocket Manager initialized successfully');
  }

  /**
   * Process message dispatch
   */
  async handleMessage(ws, message) {
    const { type, payload, id } = message;

    switch (type) {
      case 'AGENT_AUTH':
        await this.handleAgentAuth(ws, payload, id);
        break;
      case 'DASHBOARD_AUTH':
        await this.handleDashboardAuth(ws, payload, id);
        break;
      case 'HEARTBEAT':
        await this.handleHeartbeat(ws, payload, id);
        break;
      case 'METRICS_REPORT':
        await this.handleMetricsReport(ws, payload, id);
        break;
      case 'COMMAND_RESULT':
        logger.info({ payload }, 'Command result received from agent');
        break;
      case 'SYNC_RESULT':
        logger.info({ payload }, 'Config sync result received from agent');
        break;
      default:
        logger.warn({ type }, 'Unsupported message type received');
    }
  }

  /**
   * Authenticate agent node connections
   */
  async handleAgentAuth(ws, payload, messageId) {
    const { auth_type, token, agent_info } = payload;
    const { hostname, ip_address, os_type, os_version, agent_version } = agent_info;

    try {
      let serverRecord = null;

      if (auth_type === 'install_token') {
        // Look up token
        const tokenRes = await db.query(
          'SELECT id, user_id, is_used, expires_at FROM install_tokens WHERE token = $1',
          [token]
        );
        const tokenData = tokenRes.rows[0];

        if (!tokenData || tokenData.is_used || (tokenData.expires_at && new Date(tokenData.expires_at) < new Date())) {
          return ws.send(JSON.stringify({
            type: 'AUTH_RESULT',
            replyTo: messageId,
            payload: { success: false, error: 'Invalid or expired install token' }
          }));
        }

        // Generate persistent agent token
        const agentToken = crypto.randomBytes(32).toString('hex');
        
        // Register server
        const insertRes = await db.query(
          `INSERT INTO servers (owner_id, hostname, ip_address, os_type, os_version, agent_version, agent_token, status, install_token_id, last_heartbeat)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'online', $8, NOW())
           RETURNING id, owner_id`,
          [tokenData.user_id, hostname, ip_address, os_type, os_version, agent_version, agentToken, tokenData.id]
        );
        serverRecord = insertRes.rows[0];

        // Mark token as used
        await db.query(
          'UPDATE install_tokens SET is_used = true, used_at = NOW() WHERE id = $1',
          [tokenData.id]
        );

        ws.serverId = serverRecord.id;
        ws.ownerId = serverRecord.owner_id;
        ws.isAgent = true;
        this.agents.set(serverRecord.id, ws);

        // Send token result
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          replyTo: messageId,
          payload: {
            success: true,
            agent_token: agentToken,
            server_id: serverRecord.id,
            config: { heartbeat_interval_seconds: 30, metrics_interval_seconds: 60 }
          }
        }));

        // Broadcast registration to dashboard
        this.sendToDashboard(serverRecord.owner_id, {
          type: 'SERVER_REGISTERED',
          payload: {
            server: {
              id: serverRecord.id,
              hostname,
              ip_address,
              os_type,
              status: 'online'
            }
          }
        });

      } else if (auth_type === 'agent_token') {
        serverRecord = await ServerModel.findByAgentToken(token);
        if (!serverRecord) {
          return ws.send(JSON.stringify({
            type: 'AUTH_RESULT',
            replyTo: messageId,
            payload: { success: false, error: 'Invalid agent token' }
          }));
        }

        // Update server details & status to online
        await db.query(
          `UPDATE servers 
           SET hostname = $2, ip_address = $3, os_type = $4, os_version = $5, agent_version = $6, status = 'online', last_heartbeat = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [serverRecord.id, hostname, ip_address, os_type, os_version, agent_version]
        );

        ws.serverId = serverRecord.id;
        ws.ownerId = serverRecord.owner_id;
        ws.isAgent = true;
        this.agents.set(serverRecord.id, ws);

        // Send auth result
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          replyTo: messageId,
          payload: {
            success: true,
            server_id: serverRecord.id,
            config: { heartbeat_interval_seconds: 30, metrics_interval_seconds: 60 }
          }
        }));

        // Sync agent configuration (pull SOCKS5 users from DB)
        await this.syncAgentConfig(serverRecord.id);

        // Broadcast status update to dashboard
        this.sendToDashboard(serverRecord.owner_id, {
          type: 'SERVER_STATUS_CHANGED',
          payload: { server_id: serverRecord.id, status: 'online', last_heartbeat: new Date().toISOString() }
        });
      }
    } catch (err) {
      logger.error(err, 'Agent authentication failed');
      ws.send(JSON.stringify({
        type: 'AUTH_RESULT',
        replyTo: messageId,
        payload: { success: false, error: 'Internal server registration failure' }
      }));
    }
  }

  /**
   * Authenticate dashboard client WebSocket connections
   */
  async handleDashboardAuth(ws, payload, messageId) {
    const { token } = payload;
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      ws.userId = decoded.sub;
      ws.isAgent = false;

      if (!this.dashboards.has(decoded.sub)) {
        this.dashboards.set(decoded.sub, new Set());
      }
      this.dashboards.get(decoded.sub).add(ws);

      ws.send(JSON.stringify({
        type: 'DASHBOARD_AUTH_RESULT',
        replyTo: messageId,
        payload: { success: true }
      }));
      logger.info({ userId: decoded.sub }, 'Dashboard client authorized');
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'DASHBOARD_AUTH_RESULT',
        replyTo: messageId,
        payload: { success: false, error: 'Invalid session token' }
      }));
    }
  }

  /**
   * Process heartbeat keepalive logs
   */
  async handleHeartbeat(ws, payload, messageId) {
    if (!ws.serverId) return;
    try {
      await db.query(
        "UPDATE servers SET status = 'online', last_heartbeat = NOW(), updated_at = NOW() WHERE id = $1",
        [ws.serverId]
      );

      ws.send(JSON.stringify({
        type: 'HEARTBEAT_ACK',
        replyTo: messageId,
        payload: { server_time: new Date().toISOString() }
      }));

      this.sendToDashboard(ws.ownerId, {
        type: 'SERVER_STATUS_CHANGED',
        payload: { server_id: ws.serverId, status: 'online', last_heartbeat: new Date().toISOString() }
      });
    } catch (err) {
      logger.error(err, 'Failed to process heartbeat');
    }
  }

  /**
   * Save agent metrics reports
   */
  async handleMetricsReport(ws, payload, messageId) {
    if (!ws.serverId) return;
    const { cpu_usage, memory_usage, bandwidth_in, bandwidth_out, active_connections } = payload;

    try {
      await MetricModel.create({
        serverId: ws.serverId,
        cpuUsage: cpu_usage,
        memoryUsage: memory_usage,
        bandwidthIn: bandwidth_in,
        bandwidthOut: bandwidth_out,
        activeConnections: active_connections
      });

      // Update server table metadata
      const metadata = JSON.stringify({ active_connections, bandwidth_in, bandwidth_out });
      await db.query(
        'UPDATE servers SET metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $1',
        [ws.serverId, metadata]
      );

      // Forward metrics to active dashboards
      this.sendToDashboard(ws.ownerId, {
        type: 'METRICS_UPDATE',
        payload: {
          server_id: ws.serverId,
          cpu_usage,
          memory_usage,
          active_connections
        }
      });
    } catch (err) {
      logger.error(err, 'Failed to save metric report');
    }
  }

  /**
   * Synchronize configurations upon reconnect
   */
  async syncAgentConfig(serverId) {
    try {
      const usersRes = await db.query(
        `SELECT id as socks5_user_id, username, password_plain as password, port, max_connections, is_active
         FROM socks5_users WHERE server_id = $1`,
        [serverId]
      );

      this.localSendToAgent(serverId, {
        type: 'SYNC_CONFIG',
        id: crypto.randomUUID(),
        payload: {
          socks5_users: usersRes.rows
        }
      });
    } catch (err) {
      logger.error(err, 'Failed to fetch config for agent sync');
    }
  }

  /**
   * Scalable Pub/Sub routing: send message to agent on any cluster instance
   */
  sendToAgent(serverId, command) {
    this.pubClient.publish('agent_commands', JSON.stringify({ serverId, command }));
  }

  localSendToAgent(serverId, command) {
    const ws = this.agents.get(serverId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command));
    }
  }

  /**
   * Scalable Pub/Sub routing: broadcast real-time events to user's dashboards
   */
  sendToDashboard(userId, event) {
    this.pubClient.publish('dashboard_events', JSON.stringify({ userId, event }));
  }

  localSendToDashboard(userId, event) {
    const sockets = this.dashboards.get(userId);
    if (sockets) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(event));
        }
      }
    }
  }

  /**
   * Connection cleanup on exit/crashes
   */
  cleanupConnection(ws) {
    if (ws.isAgent && ws.serverId) {
      this.agents.delete(ws.serverId);
      logger.info({ serverId: ws.serverId }, 'Agent disconnected');

      // Update DB status to offline
      db.query(
        "UPDATE servers SET status = 'offline', updated_at = NOW() WHERE id = $1",
        [ws.serverId]
      ).catch((err) => logger.error(err, 'Offline update failed'));

      // Broadcast status change
      this.sendToDashboard(ws.ownerId, {
        type: 'SERVER_STATUS_CHANGED',
        payload: { server_id: ws.serverId, status: 'offline', last_heartbeat: new Date().toISOString() }
      });

    } else if (ws.userId && this.dashboards.has(ws.userId)) {
      const set = this.dashboards.get(ws.userId);
      set.delete(ws);
      if (set.size === 0) {
        this.dashboards.delete(ws.userId);
      }
      logger.info({ userId: ws.userId }, 'Dashboard disconnected');
    }
  }

  /**
   * Start Ping/Pong Heartbeat Checker
   */
  startHeartbeatInterval() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.info('Connection unresponsive, terminating');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
}

module.exports = new WebSocketManager();
