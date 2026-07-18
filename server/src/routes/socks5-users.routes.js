const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const authenticateJWT = require('../middleware/auth.middleware');
const requireServerOwnership = require('../middleware/ownership.middleware');
const validate = require('../middleware/validate.middleware');
const cryptoUtils = require('../utils/crypto');
const Socks5UserModel = require('../models/socks5-user.model');
const db = require('../config/database');
const wsManager = require('../websocket/manager');

const router = express.Router({ mergeParams: true });

router.use(authenticateJWT);
router.use(requireServerOwnership);

// Validation Schemas
const createSocks5UserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Alphanumeric and underscores only'),
    password: z.string().min(6).max(100),
    port: z.number().int().min(1024).max(65535),
    max_connections: z.number().int().min(1).max(1000).default(1),
  }),
});

const updateSocks5UserSchema = z.object({
  params: z.object({
    serverId: z.string().uuid('Invalid Server ID format'),
    socks5UserId: z.string().uuid('Invalid SOCKS5 User ID format'),
  }),
  body: z.object({
    password: z.string().min(6).max(100).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    max_connections: z.number().int().min(1).max(1000).optional(),
    is_active: z.boolean().optional(),
  }),
});

const socks5UserIdSchema = z.object({
  params: z.object({
    serverId: z.string().uuid('Invalid Server ID format'),
    socks5UserId: z.string().uuid('Invalid SOCKS5 User ID format'),
  }),
});

// GET /api/servers/:serverId/socks5-users - List SOCKS5 users
router.get('/', async (req, res, next) => {
  const { serverId } = req.params;

  try {
    const usersRes = await db.query(
      `SELECT id, username, port, max_connections, current_connections, is_active, created_at
       FROM socks5_users WHERE server_id = $1 ORDER BY created_at DESC`,
      [serverId]
    );

    res.json({
      success: true,
      data: usersRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:serverId/socks5-users - Create SOCKS5 user
router.post('/', validate(createSocks5UserSchema), async (req, res, next) => {
  const { serverId } = req.params;
  const { username, password, port, max_connections } = req.body;

  try {
    // Check if port is already taken on this server
    const portTaken = await Socks5UserModel.findByServerAndPort(serverId, port);
    if (portTaken) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: `Port ${port} is already configured on this server.`,
        }
      });
    }

    // Check if username is already taken on this server
    const userTaken = await Socks5UserModel.findByServerAndUsername(serverId, username);
    if (userTaken) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: `Username "${username}" is already configured on this server.`,
        }
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Encrypt password for agent sync (agent decrypts in memory only)
    const passwordPlain = cryptoUtils.encrypt(password);

    const newUser = await Socks5UserModel.create({
      serverId,
      username,
      passwordHash,
      passwordPlain,
      port,
      maxConnections: max_connections,
    });

    // Emit WebSocket command to agent to start SOCKS5 on port
    wsManager.sendToAgent(serverId, {
      type: 'ADD_SOCKS5_USER',
      id: crypto.randomUUID(),
      payload: {
        socks5_user_id: newUser.id,
        username,
        password: passwordPlain,
        port,
        max_connections
      }
    });

    res.status(201).json({
      success: true,
      data: newUser,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/servers/:serverId/socks5-users/:socks5UserId - Update SOCKS5 user
router.put('/:socks5UserId', validate(updateSocks5UserSchema), async (req, res, next) => {
  const { serverId, socks5UserId } = req.params;
  const { password, port, max_connections, is_active } = req.body;

  try {
    // Check if SOCKS5 user exists on this server
    const existing = await Socks5UserModel.findById(socks5UserId);
    if (!existing || existing.server_id !== serverId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'SOCKS5 user not found on this server.',
        }
      });
    }

    let passwordHash = undefined;
    let passwordPlain = undefined;

    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
      passwordPlain = cryptoUtils.encrypt(password);
    }

    if (port && port !== existing.port) {
      const portTaken = await Socks5UserModel.findByServerAndPort(serverId, port);
      if (portTaken) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: `Port ${port} is already configured on this server.`,
          }
        });
      }
    }

    const updated = await Socks5UserModel.update(socks5UserId, {
      passwordHash,
      passwordPlain,
      port,
      maxConnections: max_connections,
      isActive: is_active,
    });

    // Emit WebSocket update command to agent
    wsManager.sendToAgent(serverId, {
      type: 'UPDATE_SOCKS5_USER',
      id: crypto.randomUUID(),
      payload: {
        socks5_user_id: socks5UserId,
        username: existing.username,
        password: passwordPlain || existing.password_plain,
        port: port || existing.port,
        old_port: port && port !== existing.port ? existing.port : undefined,
        max_connections: max_connections || existing.max_connections,
        is_active: is_active !== undefined ? is_active : existing.is_active
      }
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:serverId/socks5-users/:socks5UserId - Delete SOCKS5 user
router.delete('/:socks5UserId', validate(socks5UserIdSchema), async (req, res, next) => {
  const { serverId, socks5UserId } = req.params;

  try {
    const existing = await Socks5UserModel.findById(socks5UserId);
    if (!existing || existing.server_id !== serverId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'SOCKS5 user not found on this server.',
        }
      });
    }

    await Socks5UserModel.delete(socks5UserId);

    // Emit WebSocket remove command to agent
    wsManager.sendToAgent(serverId, {
      type: 'REMOVE_SOCKS5_USER',
      id: crypto.randomUUID(),
      payload: {
        socks5_user_id: socks5UserId,
        username: existing.username,
        port: existing.port
      }
    });

    res.json({
      success: true,
      data: {
        id: socks5UserId,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
