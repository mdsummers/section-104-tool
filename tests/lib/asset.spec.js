const {
  Asset,
  Bitcoin,
  Share,
  Unit,
} = require('../../lib/asset');
const {
  ZERO,
  Big,
} = require('../../lib/big-wrapper');

describe('Asset', () => {
  const a = new Asset();
  describe('formatAmountWithUnit', () => {
    it('should throw if not passed a Big', () => {
      expect(() => a.formatAmountWithUnit()).toThrow(/given not a Big/);
    });
    it('should throw if called directly', () => {
      expect(() => a.formatAmountWithUnit(ZERO)).toThrow(/implemented/);
    });
  });

  describe('formatAmountBare', () => {
    it('should throw if not passed a Big', () => {
      expect(() => a.formatAmountBare()).toThrow(/given not a Big/);
    });
    it('should throw if called directly', () => {
      expect(() => a.formatAmountBare(ZERO)).toThrow(/implemented/);
    });
  });

  describe('header', () => {
    it('should throw if called directly', () => {
      expect(() => a.header()).toThrow(/implemented/);
    });
  });
});

describe('Bitcoin', () => {
  const b = new Bitcoin();
  describe('formatAmountWithUnit', () => {
    it('should throw if not passed a Big', () => {
      expect(() => b.formatAmountWithUnit()).toThrow(/given not a Big/);
    });
    it('should render amount in full', () => {
      expect(b.formatAmountWithUnit(ZERO)).toBe('0.00000000 BTC');
    });
    it('should render amount in full - non-zero', () => {
      expect(b.formatAmountWithUnit(new Big('2.123412345'))).toBe('2.12341235 BTC');
    });
  });

  describe('formatAmountBare', () => {
    it('should throw if not passed a Big', () => {
      expect(() => b.formatAmountBare()).toThrow(/given not a Big/);
    });
    it('should format the amount given', () => {
      expect(b.formatAmountBare(ZERO)).toBe('0.00000000');
    });
  });

  describe('header', () => {
    it('should output a header string', () => {
      expect(b.header()).toBe('BTC quantity');
    });
  });
});

describe('Share', () => {
  const s = new Share();
  describe('formatAmountWithUnit', () => {
    it('should throw if not passed a Big', () => {
      expect(() => s.formatAmountWithUnit()).toThrow(/given not a Big/);
    });
    it('should throw if not passed an integer', () => {
      expect(() => s.formatAmountWithUnit(new Big('1.0001'))).toThrow(/integer/);
    });
    it('should render amount in full', () => {
      expect(s.formatAmountWithUnit(ZERO)).toBe('0 shares');
    });
    it('should render amount in full - plural', () => {
      expect(s.formatAmountWithUnit(new Big('2'))).toBe('2 shares');
    });
    it('should render amount in full - singleton', () => {
      expect(s.formatAmountWithUnit(new Big('1'))).toBe('1 share');
    });
  });

  describe('formatAmountBare', () => {
    it('should throw if not passed a Big', () => {
      expect(() => s.formatAmountBare()).toThrow(/given not a Big/);
    });
    it('should throw if not passed an integer', () => {
      expect(() => s.formatAmountBare(new Big('1.00001'))).toThrow(/integer/);
    });
    it('should format the amount given', () => {
      expect(s.formatAmountBare(ZERO)).toBe('0');
    });
  });

  describe('header', () => {
    it('should output a header string', () => {
      expect(s.header()).toBe('Number of shares');
    });
  });
});

describe('Unit', () => {
  const u = new Unit();
  describe('formatAmountWithUnit', () => {
    it('should throw if not passed a Big', () => {
      expect(() => u.formatAmountWithUnit()).toThrow(/given not a Big/);
    });
    it('should render amount in full', () => {
      expect(u.formatAmountWithUnit(ZERO)).toBe('0.00 units');
    });
    it('should render amount in full - plural', () => {
      expect(u.formatAmountWithUnit(new Big('2'))).toBe('2.00 units');
    });
    it('should render amount in full - singleton', () => {
      expect(u.formatAmountWithUnit(new Big('1'))).toBe('1.00 unit');
    });

    it('should render amount in full - non integer', () => {
      expect(u.formatAmountWithUnit(new Big('1.123'))).toBe('1.12 units');
    });
  });

  describe('formatAmountBare', () => {
    it('should throw if not passed a Big', () => {
      expect(() => u.formatAmountBare()).toThrow(/given not a Big/);
    });
    it('should round to 2 dp', () => {
      expect(u.formatAmountBare(new Big('123.157'))).toBe('123.16');
    });
    it('should format the amount given', () => {
      expect(u.formatAmountBare(ZERO)).toBe('0.00');
    });
  });

  describe('header', () => {
    it('should output a header string', () => {
      expect(u.header()).toBe('Number of units');
    });
  });
});
