const { getPlanRate } = require('../../services/ratingService');

describe('ratingService#getPlanRate', () => {
  const mockSubscription = (tier) => ({
    planTier: tier,
  });

  test('falls back to default rate when destination group not specified', () => {
    const subscription = mockSubscription('starter');
    const rate = getPlanRate(subscription, { destinationGroup: 'unknown' });
    expect(rate).toEqual({ rateCentsPerMinute: 20, includedSeconds: 3000 });
  });

  test('uses call_center defaults when plan tier missing', () => {
    const subscription = mockSubscription('call_center');
    const rate = getPlanRate(subscription, {});
    expect(rate.rateCentsPerMinute).toBe(15);
    expect(rate.includedSeconds).toBe(12000);
  });

  test('handles missing subscription tier gracefully', () => {
    const subscription = mockSubscription('non_existent');
    const rate = getPlanRate(subscription, {});
    expect(rate).toEqual({ rateCentsPerMinute: 20, includedSeconds: 3000 });
  });
});

