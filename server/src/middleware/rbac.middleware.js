/**
 * Asserts user roles. Allows request if user.role matches one of the requiredRoles.
 */
function requireRole(...requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        }
      });
    }

    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions to access this resource.',
        }
      });
    }

    next();
  };
}

module.exports = requireRole;
