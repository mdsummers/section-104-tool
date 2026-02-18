const { v4 } = require('uuid');
const { isValidTrade } = require('../../lib/validation');
const {
  Big,
  ZERO,
} = require('../../lib/big-wrapper');

describe('validation', () => {
  describe('isValidTrade', () => {
    // known valid trade
    const control = {
      id: v4(),
      description: 'Bought 4 Units for 4 GBP at 1 GBP/Unit',
      date: new Date(),
      qty: new Big('4'),
      fee: ZERO,
      total: new Big('4'),
      raw: {},
    };

    it('should validate the control trade', () => {
      expect(isValidTrade(control)).toBe(true);
    });

    it.each([{
      id: 'foo-bar 123$!@',
    }, {
      id: 'ID#123',
    }, {
      id: ' space-padded ',
    }, {
      description: ' space-padded ',
    }, {
      description: 'Used for formatting outputs',
    }, {
      date: new Date(0),
    }, {
      date: new Date('2100-01-01T00:00:00.001Z'),
    }, {
      qty: new Big('0.00001'),
    }, {
      qty: new Big('123.123'),
    }, {
      qty: new Big('10'),
    }, {
      fee: new Big('0.00001'),
    }, {
      fee: new Big('123.123'),
    }, {
      fee: new Big('10'),
    }, {
      total: new Big('0.00001'),
    }, {
      total: new Big('123.123'),
    }, {
      total: new Big('10'),
    }, {
      raw: {
        a: 'whatever',
        b: 'we',
        c: 'want',
      },
    }])('should validate a range of inputs: %p', (input) => {
      expect(isValidTrade({
        ...control,
        ...input,
      })).toBe(true);
    });

    it('should invalidate something falsy', () => {
      expect(isValidTrade(null)).toBe(false);
    });

    it.each([{
      id: undefined,
    }, {
      id: 123,
    }, {
      id: '',
    }, {
      id: true,
    }, {
      description: null,
    }, {
      description: '',
    }, {
      date: undefined,
    }, {
      date: 1,
    }, {
      date: 'today',
    }, {
      date: new Date('foobar'),
    }, {
      qty: ZERO,
    }, {
      qty: 0,
    }, {
      qty: new Big('-1'),
    }, {
      qty: undefined,
    }, {
      fee: 1,
    }, {
      fee: new Big('-1'),
    }, {
      total: 12,
    }, {
      total: new Big('-1'),
    }, {
      raw: false,
    }])('should mark %p as invalid', (input) => {
      expect(isValidTrade({
        ...control,
        ...input,
      })).toBe(false);
    });
  });
});
