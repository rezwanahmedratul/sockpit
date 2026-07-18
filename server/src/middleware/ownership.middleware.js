const ServerModel = require('../models/server.model');

/**
 * Asserts resource ownership.
 * Admins bypass this check. Regular users must have their ID match server.owner_id.
 */
async function requireServerOwnership(req, res, next) {
  const { serverId } = req.params;

  if (!serverId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing server identifier parameter.',
      }
    });
  }

  try {
    const server = await ServerModel.findById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Server not found.',
        }
      });
    }

    // Admin bypasses ownership checks
    if (req.user.role === 'admin') {
      req.server = server;
      return next();
    }

    // Regular users must own the server
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not own this server.',
        }
      });
    }

    req.server = server;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred checking server ownership.',
      }
    });
  }
}

module.exports = requireServerOwnership;
