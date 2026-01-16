const AddOn = require('../models/AddOn');

async function listActiveAddOns() {
  const rows = await AddOn.findAll({
    where: { isActive: true },
    order: [['name', 'ASC']],
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    currency: row.currency,
    monthlyPriceCents: row.monthlyPriceCents,
    setupFeeCents: row.setupFeeCents,
  }));
}

module.exports = {
  listActiveAddOns,
};
