const { createClient } = require('redis');
const env = require('./env');

const client = createClient({
  url: env.REDIS_URL,
});

client.on('error', (err) => console.error('Redis Client Error', err));

// Connect automatically (optional, but good for single startup flow)
client.connect().catch((err) => console.error('Redis Connection Failed', err));

module.exports = client;
