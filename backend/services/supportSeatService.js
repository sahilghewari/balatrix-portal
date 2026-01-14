const sequelize = require('../config/database');
const SupportSeatAllocation = require('../models/SupportSeatAllocation');
const SupportSeatAudit = require('../models/SupportSeatAudit');
const SupportUser = require('../models/SupportUser');
const User = require('../models/User');

async function ensureAllocation(adminId, defaults = {}) {
  const [allocation] = await SupportSeatAllocation.findOrCreate({
    where: { adminId },
    defaults: {
      totalSeats: defaults.totalSeats ?? 0,
      usedSeats: defaults.usedSeats ?? 0,
      maxMonitoringSeats: defaults.maxMonitoringSeats ?? 0,
    },
  });

  return allocation;
}

async function reserveSeat(adminId, { transaction } = {}) {
  const allocation = await ensureAllocation(adminId);

  if (allocation.totalSeats <= allocation.usedSeats) {
    throw new Error('No support seats available for this tenant.');
  }

  allocation.usedSeats += 1;
  await allocation.save({ transaction });

  return allocation;
}

async function releaseSeat(adminId, { transaction } = {}) {
  const allocation = await ensureAllocation(adminId);

  allocation.usedSeats = Math.max(0, allocation.usedSeats - 1);
  await allocation.save({ transaction });

  return allocation;
}

async function enforceMonitoringSeatLimit(adminId, { transaction } = {}) {
  const allocation = await ensureAllocation(adminId);

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

async function resolveAdminContext({ actor, targetAdminId }) {
  if (actor.role === 'super_admin') {
    if (!targetAdminId) {
      throw new Error('targetAdminId required for super admin operations.');
    }

    const tenant = await User.findByPk(targetAdminId);
    if (!tenant) {
      throw new Error('Target admin not found.');
    }

    return tenant.id;
  }

  return actor.id;
}

module.exports = {
  ensureAllocation,
  reserveSeat,
  releaseSeat,
  enforceMonitoringSeatLimit,
  recordAudit,
  resolveAdminContext,
};
