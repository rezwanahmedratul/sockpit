const express = require('express');
const { z } = require('zod');
const authenticateJWT = require('../middleware/auth.middleware');
const requireServerOwnership = require('../middleware/ownership.middleware');
const validate = require('../middleware/validate.middleware');
const db = require('../config/database');

const router = express.Router();

router.use(authenticateJWT);

const listServersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['online', 'offline', 'error', 'installing']).optional(),
    search: z.string().optional(),
    owner_id: z.string().uuid('Invalid owner ID format').optional(),
  }),
});

const serverIdSchema = z.object({
  params: z.object({
    serverId: z.string().uuid('Invalid server ID format'),
  }),
});

// GET /api/servers - List servers
router.get('/', validate(listServersSchema), async (req, res, next) => {
  const { page, per_page, status, search, owner_id } = req.query;
  const offset = (page - 1) * per_page;

  try {
    let queryText = `
      SELECT s.id, s.owner_id, u.email as owner_email, s.hostname, s.ip_address,
             s.os_type, s.os_version, s.agent_version, s.status, s.last_heartbeat,
             s.created_at, COUNT(su.id)::int as socks5_users_count,
             COALESCE(s.metadata->>'active_connections', '0')::int as active_connections
      FROM servers s
      LEFT JOIN dashboard_users u ON u.id = s.owner_id
      LEFT JOIN socks5_users su ON su.server_id = s.id
    `;

    const conditions = [];
    const params = [];

    // Multi-tenancy isolation logic
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      conditions.push(`s.owner_id = $${params.length}`);
    } else if (owner_id) {
      params.push(owner_id);
      conditions.push(`s.owner_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(s.hostname ILIKE $${params.length} OR s.ip_address::text ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ' GROUP BY s.id, u.email';

    // Count total matching
    const countRes = await db.query(`SELECT COUNT(*) FROM (${queryText}) as count_temp`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Add pagination
    params.push(per_page, offset);
    queryText += ` ORDER BY s.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const serversRes = await db.query(queryText, params);

    res.json({
      success: true,
      data: serversRes.rows,
      meta: {
        page,
        per_page,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:serverId - Get server details (requires ownership check)
router.get('/:serverId', validate(serverIdSchema), requireServerOwnership, async (req, res) => {
  // requireServerOwnership middleware attaches the fetched server directly to req.server
  res.json({
    success: true,
    data: req.server,
  });
});

// DELETE /api/servers/:serverId - Remove a server
router.delete('/:serverId', validate(serverIdSchema), requireServerOwnership, async (req, res, next) => {
  const { serverId } = req.params;

  try {
    await db.query('DELETE FROM servers WHERE id = $1', [serverId]);
    
    res.json({
      success: true,
      data: {
        id: serverId,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
