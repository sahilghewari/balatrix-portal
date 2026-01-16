const { convertCents, __setTestRates, resetCache } = require('../../services/currencyService');

describe('currencyService', () => {
  beforeEach(() => {
    resetCache();
    __setTestRates({ usd: 1, eur: 0.9 });
  });

  afterEach(() => {
    resetCache();
  });

  test('converts cents between currencies using provided rates', () => {
    const result = convertCents(10000, 'usd', 'eur');
    expect(result).toBe(Math.round(10000 / 0.9));
  });

  test('returns original value when converting within same currency', () => {
    const result = convertCents(1234, 'usd', 'usd');
    expect(result).toBe(1234);
  });
});
