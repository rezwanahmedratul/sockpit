const jwt = require('jsonwebtoken');
const env = require('../config/env');
const UserModel = require('../models/user.model');

async function authenticateJWT(req, res, next) {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Missing Bearer token.',
      }
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    
    // Check if user is active and exists
    const user = await UserModel.findById(decoded.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User account is deactivated or does not exist.',
        }
      });
    }

    // Attach user metadata to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };
    
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired access token.',
      }
    });
  }
}

module.exports = authenticateJWT;
