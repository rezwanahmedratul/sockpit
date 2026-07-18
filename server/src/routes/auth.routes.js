const express = require('express');
const { z } = require('zod');
const AuthService = require('../services/auth.service');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

// Define Zod schemas for login and token refresh requests
const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'Refresh token is required'),
  }),
});

// Login endpoint
router.post('/login', validate(loginSchema), async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const { tokens, user } = await AuthService.login(email, password);

    // Send HTTP-only cookie with refresh token in production for extra security,
    // or return in JSON payload as described in docs/api-reference.md
    res.json({
      success: true,
      data: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: err.message || 'Invalid credentials.',
      }
    });
  }
});

// Refresh endpoint
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  const { refresh_token } = req.body;

  try {
    const tokens = await AuthService.refresh(refresh_token);
    res.json({
      success: true,
      data: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: err.message || 'Invalid refresh token.',
      }
    });
  }
});

// Logout endpoint
router.post('/logout', validate(refreshSchema), async (req, res, next) => {
  const { refresh_token } = req.body;

  try {
    await AuthService.logout(refresh_token);
    res.json({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
