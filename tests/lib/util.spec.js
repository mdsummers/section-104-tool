const { daysBetween } = require('../../lib/util');

describe('util', () => {
  describe('daysBetween', () => {
    it('should return 6 between Christmas and New Year', () => {
      expect(daysBetween(
        new Date('2025-12-25T08:00:00.000Z'),
        new Date('2025-12-31T08:00:00.000Z')
      )).toBe(6);
    });

    it('should return -6 between New Year and Christmas', () => {
      expect(daysBetween(
        new Date('2025-12-31T08:00:00.000Z'),
        new Date('2025-12-25T08:00:00.000Z')
      )).toBe(-6);
    });

    it('should return 0 when same day provided', () => {
      const d = new Date();
      expect(daysBetween(d, d)).toBe(0);
    });
  });
});
