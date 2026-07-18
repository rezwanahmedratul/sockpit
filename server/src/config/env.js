const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  WS_PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  AGENT_DOWNLOAD_BASE_URL: z.string().url().default('https://your-domain.com/downloads'),
  DASHBOARD_URL: z.string().url().default('https://your-domain.com'),
  ENCRYPTION_KEY: z.string().length(62).or(z.string().length(64)), // 32-byte hex key (64 characters)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

module.exports = parsed.data;
