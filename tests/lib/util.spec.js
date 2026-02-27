const { daysBetween, getUkTaxYear, getShortDate } = require('../../lib/util');

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

  describe('getUkTaxYear', () => {
    it('should throw if a non-date is passed', () => {
      expect(() => getUkTaxYear(false)).toThrow();
    });

    it('should throw if an invalid date is passed', () => {
      expect(() => getUkTaxYear(new Date('Invalid Date'))).toThrow();
    });

    it('should return the corresponding UK tax year', () => {
      expect(getUkTaxYear(new Date('2026-01-01T00:00:00Z'))).toBe('2025/26');
    });

    it('should return the corresponding UK tax year - past April 6th', () => {
      expect(getUkTaxYear(new Date('2026-04-06T00:00:00Z'))).toBe('2026/27');
    });

    it('should return the corresponding UK tax year - April 5th', () => {
      expect(getUkTaxYear(new Date('1999-04-05T00:00:00Z'))).toBe('1998/99');
    });
  });

  describe('getShortDate', () => {
    it('should return the first part of the ISO8601 string', () => {
      expect(getShortDate(new Date('2021-01-01T12:12:23.000Z'))).toBe('2021-01-01');
    });

    it('should take other constructed Date objs', () => {
      expect(getShortDate(new Date(0))).toBe('1970-01-01');
    });
  });
});
