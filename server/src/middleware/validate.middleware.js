/**
 * Middleware wrapper to validate request structure (body, query, params) using Zod schema.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.join('.').replace(/^(body|query|params)\./, ''),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body or parameters.',
          details,
        }
      });
    }

    // Define properties on req to override Express query/body/params getters
    if (result.data.body) {
      Object.defineProperty(req, 'body', {
        value: result.data.body,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (result.data.query) {
      Object.defineProperty(req, 'query', {
        value: result.data.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (result.data.params) {
      Object.defineProperty(req, 'params', {
        value: result.data.params,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}

module.exports = validate;
