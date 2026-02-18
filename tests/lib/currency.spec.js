const {
  Currency,
  GBP,
} = require('../../lib/currency');
const {
  Big,
  ZERO,
} = require('../../lib/big-wrapper');

describe('Currency', () => {
  describe('GBP', () => {
    it('should be an instance of Currency', () => {
      expect(GBP instanceof Currency).toBe(true);
    });

    it('should store other metadata about GBP', () => {
      expect(GBP).toMatchObject({
        code: 'GBP',
        symbol: '£',
      });
    });

    it('should format Bigs in an expected way', () => {
      expect(GBP.format(new Big('-6500.123')))
        .toBe('-£6500.12');
      expect(GBP.format(new Big('123.497')))
        .toBe('£123.50');
      expect(GBP.format(ZERO))
        .toBe('£0.00');
    });
  });
});
