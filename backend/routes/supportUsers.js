const express = require('express');
const bcrypt = require('bcrypt');
const asyncHandler = require('../middleware/asyncHandler');
const validateRequest = require('../middleware/validateRequest');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAllocation, updateAllocation, resolveAdminContext, getNextSeatNumber, reserveSeat, releaseSeat, recordAudit } = require('../services/supportSeatService');
const SupportUser = require('../models/SupportUser');
const Extension = require('../models/Extension');
const sequelize = require('../config/database');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

function sanitizeSupportUser(instance) {
  if (!instance) return null;
  const plain = instance.get({ plain: true });
  delete plain.passwordHash;
  return plain;
}

router.get(
  '/',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const adminId = await resolveAdminContext({ actor: req.user, targetAdminId: req.query.adminId });
    const supportUsers = await SupportUser.findAll({
      where: { adminId },
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: Extension,
          as: 'monitoringExtension',
          attributes: ['id', 'extNumber', 'isMonitoring', 'webrtcUsername'],
        },
      ],
    });
    return res.status(200).json({
      users: supportUsers.map(sanitizeSupportUser),
    });
  })
);

router.post(
  '/',
  authenticate,
  requireRole(ADMIN_ROLES),
  validateRequest(['name', 'email', 'phone', 'password']),
  asyncHandler(async (req, res) => {
    const adminId = await resolveAdminContext({ actor: req.user, targetAdminId: req.body.adminId });
    const { name, email, phone, password, status } = req.body;

    const existing = await SupportUser.findOne({ where: { adminId, email } });
    if (existing) {
      return res.status(409).json({ message: 'Support user with this email already exists for tenant.' });
    }

    const allocation = await reserveSeat(adminId);

    const seatNumber = await getNextSeatNumber(adminId);
    const passwordHash = await bcrypt.hash(password, 10);
    const supportUser = await SupportUser.create({
      adminId,
      name,
      email,
      phone,
      seatNumber,
      passwordHash,
      status: status === 'suspended' ? 'suspended' : 'active',
      invitedAt: new Date(),
      invitedBy: req.user.id,
    });

    await recordAudit({
      adminId,
      actorId: req.user.id,
      supportUserId: supportUser.id,
      action: 'support_user_created',
      metadata: { seatNumber, allocation: allocation.get({ plain: true }) },
    });

    return res.status(201).json({ user: sanitizeSupportUser(supportUser) });
  })
);

router.patch(
  '/:supportUserId',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const adminId = await resolveAdminContext({ actor: req.user, targetAdminId: req.body.adminId });
    const { supportUserId } = req.params;
    const { name, phone, status, resetPassword } = req.body;

    const supportUser = await SupportUser.findOne({ where: { id: supportUserId, adminId } });
    if (!supportUser) {
      return res.status(404).json({ message: 'Support user not found.' });
    }

    if (name) supportUser.name = name;
    if (phone) supportUser.phone = phone;
    if (status && ['active', 'suspended'].includes(status)) {
      supportUser.status = status;
    }
    if (resetPassword) {
      supportUser.passwordHash = await bcrypt.hash(resetPassword, 10);
    }

    await supportUser.save();

    await recordAudit({
      adminId,
      actorId: req.user.id,
      supportUserId: supportUser.id,
      action: 'support_user_updated',
    });

    return res.status(200).json({ user: sanitizeSupportUser(supportUser) });
  })
);

router.delete(
  '/:supportUserId',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const adminId = await resolveAdminContext({ actor: req.user, targetAdminId: req.query.adminId });
    const { supportUserId } = req.params;

    const supportUser = await SupportUser.findOne({ where: { id: supportUserId, adminId } });
    if (!supportUser) {
      return res.status(404).json({ message: 'Support user not found.' });
    }

    await sequelize.transaction(async (transaction) => {
      await SupportUser.destroy({ where: { id: supportUserId }, transaction });
      await releaseSeat(adminId, { transaction });
      await recordAudit(
        {
          adminId,
          actorId: req.user.id,
          supportUserId,
          action: 'support_user_deleted',
        },
        { transaction }
      );
    });

    return res.status(204).send();
  })
);

router.get(
  '/allocation',
  authenticate,
  requireRole(ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const adminId = await resolveAdminContext({ actor: req.user, targetAdminId: req.query.adminId });
    const allocation = await getAllocation(adminId);
    return res.status(200).json({ allocation });
  })
);

router.put(
  '/allocation',
  authenticate,
  requireRole(['super_admin']),
  validateRequest(['adminId']),
  asyncHandler(async (req, res) => {
    const adminId = req.body.adminId;
    const { totalSeats, maxMonitoringSeats } = req.body;

    const allocation = await sequelize.transaction(async (transaction) => {
      return updateAllocation(adminId, { totalSeats, maxMonitoringSeats }, { actorId: req.user.id, transaction });
    });

    return res.status(200).json({ allocation });
  })
);

module.exports = router;
