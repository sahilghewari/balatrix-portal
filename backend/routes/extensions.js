const express = require('express');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  createExtension,
  updateExtensionPassword,
  deleteExtension,
  listExtensions,
} = require('../services/extensionService');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.get(
  '/',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const extensions = await listExtensions(req.user.id);
    return res.status(200).json({
      extensions: extensions.map((extension) => ({
        id: extension.id,
        subscriptionId: extension.subscriptionId,
        extNumber: extension.extNumber,
        isMonitoring: extension.isMonitoring,
        webrtcUsername: extension.webrtcUsername,
        subscription: extension.subscription,
        createdAt: extension.createdAt,
        updatedAt: extension.updatedAt,
      })),
    });
  })
);

router.post(
  '/',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['subscriptionId', 'extNumber', 'password']),
  asyncHandler(async (req, res) => {
    const { subscriptionId, extNumber, password, isMonitoring } = req.body;
    const extension = await createExtension({
      userId: req.user.id,
      subscriptionId,
      extNumber,
      password,
      isMonitoring: Boolean(isMonitoring),
    });

    return res.status(201).json({
      message: 'Extension created successfully.',
      extension,
    });
  })
);

router.put(
  '/:extensionId/password',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['password']),
  asyncHandler(async (req, res) => {
    const { extensionId } = req.params;
    const { password } = req.body;

    const extension = await updateExtensionPassword({
      userId: req.user.id,
      extensionId,
      password,
    });

    return res.status(200).json({
      message: 'Extension password updated successfully.',
      extension,
    });
  })
);

router.delete(
  '/:extensionId',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const { extensionId } = req.params;

    await deleteExtension({
      userId: req.user.id,
      extensionId,
    });

    return res.status(204).send();
  })
);

module.exports = router;
