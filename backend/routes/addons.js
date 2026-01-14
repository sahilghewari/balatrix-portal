const express = require('express');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { purchaseMonitoringAddon } = require('../services/monitoringService');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.post(
  '/monitoring',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['subscriptionId']),
  asyncHandler(async (req, res) => {
    const { subscriptionId, adminId } = req.body;
    const subscription = await purchaseMonitoringAddon({
      actor: req.user,
      targetAdminId: adminId,
      subscriptionId,
    });

    return res.status(200).json({
      message: 'Monitoring add-on purchased successfully.',
      subscription,
    });
  })
);

module.exports = router;
