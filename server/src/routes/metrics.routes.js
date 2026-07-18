const express = require('express');
const { z } = require('zod');
const authenticateJWT = require('../middleware/auth.middleware');
const requireServerOwnership = require('../middleware/ownership.middleware');
const validate = require('../middleware/validate.middleware');
const MetricModel = require('../models/metric.model');

const router = express.Router({ mergeParams: true });

router.use(authenticateJWT);
router.use(requireServerOwnership);

const getMetricsSchema = z.object({
  query: z.object({
    range: z.enum(['1h', '6h', '24h', '7d']).default('1h'),
    interval: z.enum(['1m', '5m', '1h']).default('1m'),
  }),
});

// GET /api/servers/:serverId/metrics - Fetch historical metrics
router.get('/', validate(getMetricsSchema), async (req, res, next) => {
  const { serverId } = req.params;
  const { range, interval } = req.query;

  try {
    const history = await MetricModel.findHistory(serverId, range, interval);

    // Format output as detailed arrays for UI chart libraries matching specs
    const responseData = {
      timestamps: [],
      cpu_usage: [],
      memory_usage: [],
      bandwidth_in: [],
      bandwidth_out: [],
      active_connections: [],
    };

    history.forEach((row) => {
      responseData.timestamps.push(row.timestamp);
      responseData.cpu_usage.push(parseFloat(row.cpu_usage) || 0.0);
      responseData.memory_usage.push(parseFloat(row.memory_usage) || 0.0);
      responseData.bandwidth_in.push(parseInt(row.bandwidth_in, 10) || 0);
      responseData.bandwidth_out.push(parseInt(row.bandwidth_out, 10) || 0);
      responseData.active_connections.push(parseInt(row.active_connections, 10) || 0);
    });

    res.json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
