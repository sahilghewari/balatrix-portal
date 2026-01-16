const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { listActiveAddOns } = require('../services/addOnService');

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const addons = await listActiveAddOns();
    res.json({ addons });
  })
);

module.exports = router;
