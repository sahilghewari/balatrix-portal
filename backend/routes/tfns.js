const express = require('express');
const dotenv = require('dotenv');
const { authenticate, requireRole } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { selectTfn, listActiveTfns, listAvailableTfns } = require('../services/tfnService');

dotenv.config();

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (req.query.status === 'available') {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const tfns = await listAvailableTfns({ limit });
      return res.status(200).json({ tfns });
    }

    const tfns = await listActiveTfns(req.user.id);
    return res.status(200).json({ tfns });
  })
);

router.post(
  '/select',
  authenticate,
  requireRole('admin'),
  validateRequest(['subscriptionId', 'phoneNumber']),
  asyncHandler(async (req, res) => {
    try {
      const { subscriptionId, phoneNumber } = req.body;
      const tfn = await selectTfn({
        userId: req.user.id,
        subscriptionId,
        phoneNumber,
      });

      return res.status(200).json({
        message: 'TFN assigned successfully.',
        tfn,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      return res.status(status).json({
        message: error.message || 'Failed to assign the toll-free number.',
      });
    }
  })
);

module.exports = router;
