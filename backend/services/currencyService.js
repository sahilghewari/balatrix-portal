const DEFAULT_RATES = { usd: 1 };

let cachedRates;

function normaliseRates(rates = {}) {
  return Object.entries(rates).reduce((acc, [code, value]) => {
    if (!code) return acc;
    const key = String(code).toLowerCase();
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
}

function loadRates() {
  if (cachedRates) {
    return cachedRates;
  }

  let source = DEFAULT_RATES;
  const envRates = process.env.CURRENCY_RATES || process.env.EXCHANGE_RATES_JSON;

  if (envRates) {
    try {
      const parsed = JSON.parse(envRates);
      source = { ...DEFAULT_RATES, ...parsed };
    } catch (error) {
      console.warn('Failed to parse CURRENCY_RATES env variable, falling back to defaults.', error.message);
    }
  }

  cachedRates = normaliseRates(source);
  if (!Object.keys(cachedRates).length) {
    cachedRates = { ...DEFAULT_RATES };
  }
  return cachedRates;
}

function getExchangeRate(fromCurrency, toCurrency) {
  const rates = loadRates();
  const fromKey = String(fromCurrency || 'usd').toLowerCase();
  const toKey = String(toCurrency || 'usd').toLowerCase();

  if (fromKey === toKey) {
    return 1;
  }

  const fromRate = rates[fromKey];
  const toRate = rates[toKey];

  if (!fromRate || !toRate) {
    throw new Error(`Missing exchange rate for ${fromCurrency}→${toCurrency}`);
  }

  // Rates represent how many USD equals one unit of the currency.
  // To convert from -> to, move through USD.
  return fromRate / toRate;
}

function convertCents(amountCents, fromCurrency, toCurrency) {
  if (!amountCents) {
    return 0;
  }

  const rate = getExchangeRate(fromCurrency, toCurrency);
  return Math.round(Number(amountCents) * rate);
}

function resetCache() {
  cachedRates = null;
}

function __setTestRates(rates) {
  cachedRates = normaliseRates(rates);
}

module.exports = {
  convertCents,
  getExchangeRate,
  resetCache,
  __setTestRates,
};
