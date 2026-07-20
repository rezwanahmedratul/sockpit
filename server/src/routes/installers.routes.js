const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const authenticateJWT = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const db = require('../config/database');
const env = require('../config/env');

const router = express.Router();

const generateScriptSchema = z.object({
  body: z.object({
    platform: z.enum(['windows', 'linux', 'docker']),
    label: z.string().min(3).max(100).optional(),
  }),
});

const runScriptSchema = z.object({
  params: z.object({
    token: z.string().length(25, 'Invalid install token format'), // 25 characters
  }),
});

// POST /api/installers/script - Generate script
router.post('/script', authenticateJWT, validate(generateScriptSchema), async (req, res, next) => {
  const { platform, label } = req.body;
  const userId = req.user.id;

  try {
    // 1. Generate unique 25-char alphanumeric token
    const token = crypto.randomBytes(15).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 25);

    // 2. Save token to DB
    await db.query(
      `INSERT INTO install_tokens (token, user_id, label, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
      [token, userId, label || `Install script - ${platform}`]
    );

    // 3. Load template
    const templateFileName = `${platform}-install.${platform === 'windows' ? 'ps1' : 'sh'}.tpl`;
    const templatePath = path.join(__dirname, '../installers/templates', templateFileName);

    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: `Template not found: ${templateFileName}` }
      });
    }

    let template = fs.readFileSync(templatePath, 'utf8');

    // Dynamically resolve server URLs using host headers and environment variables
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168.') || host.includes('10.');
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
    
    // API URL is the HTTP server host
    const apiUrl = `${protocol}://${host}`;
    // WebSocket URL prefers configured WS_URL / NEXT_PUBLIC_WS_URL if set
    const wsUrl = env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}://${host.split(':')[0]}:${env.WS_PORT}`;

    // 4. Render template
    const rendered = template
      .replace(/\{\{INSTALL_TOKEN\}\}/g, token)
      .replace(/\{\{SERVER_URL\}\}/g, wsUrl)
      .replace(/\{\{API_URL\}\}/g, apiUrl)
      .replace(/\{\{AGENT_DOWNLOAD_URL\}\}/g, `${apiUrl}/downloads/agent-${platform}-amd64${platform === 'windows' ? '.exe' : ''}`)
      .replace(/\{\{AGENT_VERSION\}\}/g, '1.0.0')
      .replace(/\{\{CHECKSUM\}\}/g, 'SKIP') // We skip checksum for custom developer tests
      .replace(/\{\{ENCRYPTION_KEY\}\}/g, env.ENCRYPTION_KEY)
      .replace(/\{\{USER_EMAIL\}\}/g, req.user.email || 'user@sockpit.local')
      .replace(/\{\{GENERATED_AT\}\}/g, new Date().toISOString());

    // 5. Create audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, details)
       VALUES ($1, 'install_token_generated', 'install_token', $2::jsonb)`,
      [userId, JSON.stringify({ platform, label, token })]
    );

    res.json({
      success: true,
      data: {
        token,
        platform,
        script: rendered,
        one_liner: platform === 'windows'
          ? `irm ${apiUrl}/api/installers/run/${token} | iex`
          : `curl -sSL ${apiUrl}/api/installers/run/${token} | sudo bash`
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /api/installers/run/:token - Stream rendered script raw for curl/PowerShell
router.get('/run/:token', async (req, res, next) => {
  const { token } = req.params;

  try {
    // 1. Fetch token details
    const tokenRes = await db.query(
      `SELECT t.id, t.user_id, t.is_used, t.expires_at, t.label, u.email
       FROM install_tokens t
       JOIN dashboard_users u ON u.id = t.user_id
       WHERE t.token = $1`,
      [token]
    );
    const tokenData = tokenRes.rows[0];

    if (!tokenData) {
      return res.status(404).send('# Error: Invalid installer token');
    }

    if (tokenData.is_used) {
      return res.status(410).send('# Error: Install token has already been used');
    }

    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return res.status(410).send('# Error: Install token has expired');
    }

    // Determine platform from token label
    const label = tokenData.label.toLowerCase();
    let platform = 'linux';
    if (label.includes('windows')) {
      platform = 'windows';
    } else if (label.includes('docker')) {
      platform = 'docker';
    }

    // 2. Load template
    const templateFileName = `${platform}-install.${platform === 'windows' ? 'ps1' : 'sh'}.tpl`;
    const templatePath = path.join(__dirname, '../installers/templates', templateFileName);

    if (!fs.existsSync(templatePath)) {
      return res.status(500).send('# Error: Installer template not found');
    }

    let template = fs.readFileSync(templatePath, 'utf8');

    // Dynamically resolve server URLs using host headers
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure ? 'https' : 'http';
    const wsProtocol = req.secure ? 'wss' : 'ws';
    const apiUrl = `${protocol}://${host}`;
    const wsUrl = `${wsProtocol}://${host.split(':')[0]}:${env.WS_PORT}`;

    // 3. Render template
    const rendered = template
      .replace(/\{\{INSTALL_TOKEN\}\}/g, token)
      .replace(/\{\{SERVER_URL\}\}/g, wsUrl)
      .replace(/\{\{API_URL\}\}/g, apiUrl)
      .replace(/\{\{AGENT_DOWNLOAD_URL\}\}/g, `${apiUrl}/downloads/agent-${platform}-amd64${platform === 'windows' ? '.exe' : ''}`)
      .replace(/\{\{AGENT_VERSION\}\}/g, '1.0.0')
      .replace(/\{\{CHECKSUM\}\}/g, 'SKIP')
      .replace(/\{\{ENCRYPTION_KEY\}\}/g, env.ENCRYPTION_KEY)
      .replace(/\{\{USER_EMAIL\}\}/g, tokenData.email)
      .replace(/\{\{GENERATED_AT\}\}/g, new Date().toISOString());

    // 4. Return text plain
    res.setHeader('Content-Type', 'text/plain');
    res.send(rendered);

  } catch (err) {
    next(err);
  }
});

module.exports = router;
