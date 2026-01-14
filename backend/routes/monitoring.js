const express = require('express');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  grantMonitoringAccess,
  revokeMonitoringAccess,
  purchaseMonitoringAddon,
  getMonitoringStatus,
} = require('../services/monitoringService');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.get(
  '/status',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const status = await getMonitoringStatus(req.user, req.query.adminId);
    return res.status(200).json({ status });
  })
);

router.post(
  '/purchase',
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
      message: 'Monitoring add-on activated.',
      subscription,
    });
  })
);

router.put(
  '/grant',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['supportUserId', 'extensionId']),
  asyncHandler(async (req, res) => {
    const { supportUserId, extensionId, adminId } = req.body;
    const supportUser = await grantMonitoringAccess({
      actor: req.user,
      targetAdminId: adminId,
      supportUserId,
      extensionId,
    });

    return res.status(200).json({
      message: 'Monitoring access granted successfully.',
      supportUser,
    });
  })
);

router.put(
  '/revoke',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['supportUserId']),
  asyncHandler(async (req, res) => {
    const { supportUserId, adminId } = req.body;
    const supportUser = await revokeMonitoringAccess({
      actor: req.user,
      targetAdminId: adminId,
      supportUserId,
    });

    return res.status(200).json({
      message: 'Monitoring access revoked successfully.',
      supportUser,
    });
  })
);

module.exports = router;
