const SupportSeatAllocation = require('../models/SupportSeatAllocation');
const SupportSeatAudit = require('../models/SupportSeatAudit');
const SupportUser = require('../models/SupportUser');
const User = require('../models/User');
const sequelize = require('../config/database');

function sanitizeAllocation(allocationInstance) {
  if (!allocationInstance) return null;
  const plain = allocationInstance.get({ plain: true });
  return {
    adminId: plain.adminId,
    totalSeats: plain.totalSeats,
    usedSeats: plain.usedSeats,
    maxMonitoringSeats: plain.maxMonitoringSeats,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

async function ensureAllocation(adminId, { defaults = {}, transaction } = {}) {
  const [allocation] = await SupportSeatAllocation.findOrCreate({
    where: { adminId },
    defaults: {
      totalSeats: defaults.totalSeats ?? 0,
      usedSeats: defaults.usedSeats ?? 0,
      maxMonitoringSeats: defaults.maxMonitoringSeats ?? 0,
    },
    transaction,
  });

  return allocation;
}

async function reserveSeat(adminId, { transaction } = {}) {
  const tx = transaction || (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const allocation = await ensureAllocation(adminId, { transaction: tx });

    if (allocation.totalSeats <= allocation.usedSeats) {
      throw new Error('No support seats available for this tenant.');
    }

    allocation.usedSeats += 1;
    await allocation.save({ transaction: tx, fields: ['usedSeats'] });

    if (shouldCommit) await tx.commit();
    return allocation;
  } catch (error) {
    if (shouldCommit) await tx.rollback();
    throw error;
  }
}

async function releaseSeat(adminId, { transaction } = {}) {
  const tx = transaction || (await sequelize.transaction());
  const shouldCommit = !transaction;

  try {
    const allocation = await ensureAllocation(adminId, { transaction: tx });

    allocation.usedSeats = Math.max(0, allocation.usedSeats - 1);
    await allocation.save({ transaction: tx, fields: ['usedSeats'] });

    if (shouldCommit) await tx.commit();
    return allocation;
  } catch (error) {
    if (shouldCommit) await tx.rollback();
    throw error;
  }
}

async function enforceMonitoringSeatLimit(adminId, { transaction } = {}) {
  const allocation = await ensureAllocation(adminId, { transaction });

  if (allocation.maxMonitoringSeats === 0) {
    return allocation;
  }

  const activeMonitoring = await SupportUser.count({
    where: { adminId, monitoringAccess: true, status: 'active' },
    transaction,
  });

  if (activeMonitoring >= allocation.maxMonitoringSeats) {
    throw new Error('Monitoring seat quota exhausted.');
  }

  return allocation;
}

async function recordAudit({ adminId, actorId, supportUserId, action, metadata }, { transaction } = {}) {
  await SupportSeatAudit.create(
    {
      adminId,
      actorId,
      supportUserId: supportUserId || null,
      action,
      metadata: metadata || null,
    },
    { transaction }
  );
}

async function resolveAdminContext({ actor, targetAdminId, transaction } = {}) {
  if (actor.role === 'super_admin') {
    if (!targetAdminId) {
      throw new Error('targetAdminId required for super admin operations.');
    }

    const tenant = await User.findByPk(targetAdminId, { transaction });
    if (!tenant) {
      throw new Error('Target admin not found.');
    }

    return tenant.id;
  }

  return actor.id;
}

async function getAllocation(adminId, { transaction } = {}) {
  const allocation = await ensureAllocation(adminId, { transaction });
  return sanitizeAllocation(allocation);
}

async function updateAllocation(adminId, { totalSeats, maxMonitoringSeats }, { actorId, transaction } = {}) {
  const allocation = await ensureAllocation(adminId, { transaction });

  if (typeof totalSeats === 'number') {
    if (totalSeats < allocation.usedSeats) {
      throw new Error('Total seats cannot be less than currently used seats.');
    }
    allocation.totalSeats = totalSeats;
  }

  if (typeof maxMonitoringSeats === 'number') {
    if (maxMonitoringSeats < 0) {
      throw new Error('maxMonitoringSeats must be zero or a positive integer.');
    }
    allocation.maxMonitoringSeats = maxMonitoringSeats;
  }

  await allocation.save({ transaction });

  if (actorId) {
    await recordAudit(
      {
        adminId,
        actorId,
        action: 'seat_allocation_updated',
        metadata: {
          totalSeats: allocation.totalSeats,
          maxMonitoringSeats: allocation.maxMonitoringSeats,
        },
      },
      { transaction }
    );
  }

  return sanitizeAllocation(allocation);
}

async function getNextSeatNumber(adminId, { transaction } = {}) {
  const existing = await SupportUser.findAll({
    where: { adminId, status: 'active' },
    attributes: ['seatNumber'],
    order: [['seatNumber', 'ASC']],
    transaction,
  });

  let candidate = 1;
  for (const entry of existing) {
    const seat = entry.seatNumber;
    if (seat === candidate) {
      candidate += 1;
    } else if (seat > candidate) {
      break;
    }
  }

  return candidate;
}

module.exports = {
  ensureAllocation,
  reserveSeat,
  releaseSeat,
  enforceMonitoringSeatLimit,
  recordAudit,
  resolveAdminContext,
  getAllocation,
  updateAllocation,
  getNextSeatNumber,
};
