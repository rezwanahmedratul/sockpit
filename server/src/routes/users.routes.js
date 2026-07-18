const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const authenticateJWT = require('../middleware/auth.middleware');
const requireRole = require('../middleware/rbac.middleware');
const validate = require('../middleware/validate.middleware');
const UserModel = require('../models/user.model');
const db = require('../config/database');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireRole('admin'));

// Validation Schemas
const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    role: z.enum(['admin', 'user']).optional(),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    display_name: z.string().min(1, 'Display name is required'),
    role: z.enum(['admin', 'user']).default('user'),
  }),
});

const updateUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
  body: z.object({
    display_name: z.string().optional(),
    role: z.enum(['admin', 'user']).optional(),
    is_active: z.boolean().optional(),
  }),
});

const userIdSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
});

// GET /api/users - List users
router.get('/', validate(listUsersSchema), async (req, res, next) => {
  const { page, per_page, search, role } = req.query;
  const offset = (page - 1) * per_page;

  try {
    let queryText = `
      SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.created_at,
             COUNT(s.id)::int as servers_count
      FROM dashboard_users u
      LEFT JOIN servers s ON s.owner_id = u.id
    `;
    
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }

    if (role) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ' GROUP BY u.id';
    
    // Count total matching
    const countRes = await db.query(`SELECT COUNT(*) FROM (${queryText}) as count_temp`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Add pagination
    params.push(per_page, offset);
    queryText += ` ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    
    const usersRes = await db.query(queryText, params);

    res.json({
      success: true,
      data: usersRes.rows,
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

// POST /api/users - Create user
router.post('/', validate(createUserSchema), async (req, res, next) => {
  const { email, password, display_name, role } = req.body;

  try {
    const exists = await UserModel.findByEmail(email);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A user with this email address already exists.',
        }
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({
      email,
      passwordHash,
      displayName: display_name,
      role,
    });

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:userId - Update user
router.put('/:userId', validate(updateUserSchema), async (req, res, next) => {
  const { userId } = req.params;
  const { display_name, role, is_active } = req.body;

  try {
    const updated = await UserModel.update(userId, {
      displayName: display_name,
      role,
      isActive: is_active,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found.',
        }
      });
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:userId - Delete user
router.delete('/:userId', validate(userIdSchema), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const deleted = await UserModel.delete(userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found.',
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: deleted.id,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
