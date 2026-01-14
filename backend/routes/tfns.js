const express = require('express');
const dotenv = require('dotenv');
const { authenticate, requireRole } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { selectTfn, listActiveTfns } = require('../services/tfnService');

dotenv.config();

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
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
  })
);

module.exports = router;
