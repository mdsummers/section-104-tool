const {
  isBig,
  ZERO,
  Big,
  bigMin,
} = require('../../lib/big-wrapper');

describe('isBig', () => {
  it.each([
    1,
    '',
    Math.PI,
    false,
    true,
    null,
    {},
  ])('should return false for invalid input: %p', (input) => {
    expect(isBig(input)).toBe(false);
  });

  it.each([
    new Big('0'),
    new Big('10.00000000001'),
    ZERO,
  ])('should return true for valid input: %p', (input) => {
    expect(isBig(input)).toBe(true);
  });
});

describe('bigMin', () => {
  it('should return a if a < b', () => {
    const a = new Big('-10');
    const b = new Big('20');
    expect(bigMin(a, b)).toBe(a);
  });

  it('should return b if b < a', () => {
    const a = new Big('3.00000000000001');
    const b = new Big('3');
    expect(bigMin(a, b)).toBe(b);
  });
});
