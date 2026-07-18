const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const redisClient = require('../config/redis');
const UserModel = require('../models/user.model');

class AuthService {
  /**
   * Validate password hash and generate access + refresh token payload
   */
  static async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user || !user.is_active) {
      throw new Error('Invalid email or deactivated account');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid password');
    }

    const tokens = await this.generateTokenPair(user);
    return { tokens, user };
  }

  /**
   * Create JWT token pair and record refresh token in Redis
   */
  static async generateTokenPair(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });

    const refreshTokenId = crypto.randomUUID();
    const refreshPayload = {
      sub: user.id,
      type: 'refresh',
      jti: refreshTokenId,
    };

    const refreshToken = jwt.sign(refreshPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    });

    // Store refresh token identifier in Redis with TTL matching token expiration
    // Default refresh duration is 7 days (604800 seconds)
    await redisClient.set(`refresh_token:${user.id}:${refreshTokenId}`, 'true', {
      EX: 7 * 24 * 60 * 60,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Verify refresh token, rotate to a new pair, and revoke old token
   */
  static async refresh(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_SECRET);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if this token exists in Redis
      const key = `refresh_token:${payload.sub}:${payload.jti}`;
      const exists = await redisClient.get(key);
      if (!exists) {
        throw new Error('Revoked or expired refresh token');
      }

      // Revoke the old token
      await redisClient.del(key);

      // Generate a new pair
      const user = await UserModel.findById(payload.sub);
      if (!user || !user.is_active) {
        throw new Error('User not found or deactivated');
      }

      return await this.generateTokenPair(user);
    } catch (err) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Revoke refresh token from Redis
   */
  static async logout(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_SECRET);
      if (payload.type === 'refresh') {
        const key = `refresh_token:${payload.sub}:${payload.jti}`;
        await redisClient.del(key);
      }
    } catch (err) {
      // Ignore token parsing errors on logout (fail-safe)
    }
  }
}

module.exports = AuthService;
