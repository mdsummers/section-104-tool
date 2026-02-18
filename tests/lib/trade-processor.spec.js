const {
  Big,
  ZERO,
  enableBigInspect,
  disableBigInspect,
} = require('../../lib/big-wrapper');
const { GBP } = require('../../lib/currency');
const TradeProcessor = require('../../lib/trade-processor');

describe('TradeProcessor', () => {
  beforeAll(() => enableBigInspect());
  afterAll(() => disableBigInspect());
  beforeEach(() => {
    // eslint-disable-next-line global-require
    global.console = require('console');
  });
  // https://www.gov.uk/government/publications/shares-and-capital-gains-tax-hs284-self-assessment-helpsheet/hs284-shares-and-capital-gains-tax-2021#how-to-work-out-the-gain-for-shares-in-a-section-104-holding
  describe('HS284 examples', () => {
    it('should follow example 1', () => {
      // example 1 doesn't include the amount paid, so we'll say 1 GBP per
      const trades = [{
        id: '#1',
        type: 'BUY',
        date: new Date('1979-06-01T09:00:00.000Z'),
        description: 'Bought 2000 shares in Wilson and Strickland PLC',
        qty: new Big('2000'),
        fee: ZERO,
        total: new Big('2000'),
        raw: {},
      }, {
        id: '#2',
        type: 'BUY',
        date: new Date('1982-11-04T09:00:00.000Z'),
        description: 'Bought 2500 shares in Wilson and Strickland PLC',
        qty: new Big('2500'),
        fee: ZERO,
        total: new Big('2500'),
        raw: {},
      }, {
        id: '#3',
        type: 'BUY',
        date: new Date('1987-08-26T09:00:00.000Z'),
        description: 'Bought 2500 shares in Wilson and Strickland PLC',
        qty: new Big('2500'),
        fee: ZERO,
        total: new Big('2500'),
        raw: {},
      }, {
        id: '#4',
        type: 'BUY',
        date: new Date('1998-07-01T09:00:00.000Z'),
        description: 'Bought 3000 shares in Wilson and Strickland PLC',
        qty: new Big('3000'),
        fee: ZERO,
        total: new Big('3000'),
        raw: {},
      }, {
        id: '#5',
        type: 'BUY',
        date: new Date('2006-05-14T09:00:00.000Z'),
        description: 'Bought 2000 shares in Wilson and Strickland PLC',
        qty: new Big('2000'),
        fee: ZERO,
        total: new Big('2000'),
        raw: {},
      }];
      const tp = new TradeProcessor({
        asset: 'Wilson and Strickland plc',
        currency: GBP,
      });
      const {
        pool: {
          qty,
          cost,
        },
      } = tp.process(trades);
      expect(qty.eq(new Big('12000'))).toBe(true);
      expect(cost.eq(new Big('12000'))).toBe(true); // not part of example
    });

    it('should follow example 2', () => {
      const trades = [{
        id: '#1',
        type: 'BUY',
        date: new Date('2020-03-01T09:00:00.000Z'),
        description: 'Bought 9500 shares in Mesopotamia plc',
        qty: new Big('9500'),
        fee: ZERO,
        total: new Big('9500'), // we do not know this figure
        raw: {},
      }, {
        id: '#2',
        type: 'SELL',
        date: new Date('2020-08-30T09:00:00.000Z'),
        description: 'Sold 4000 shares in Mesopotamia plc',
        qty: new Big('4000'),
        fee: ZERO,
        total: new Big('6000'),
        raw: {},
      }, {
        id: '#3',
        type: 'BUY',
        date: new Date('2020-09-11T09:00:00.000Z'),
        description: 'Bought 500 shares in Mesopotamia plc',
        qty: new Big('500'),
        fee: ZERO,
        total: new Big('850'),
        raw: {},
      }];

      const tp = new TradeProcessor({
        asset: 'Mesopotamia plc',
        currency: GBP,
      });
      const {
        disposals,
        pool: {
          qty: poolQty,
          cost: poolCost,
        },
      } = tp.process(trades);
      expect(poolQty.eq('6000')).toBe(true);
      expect(poolCost.eq('6000')).toBe(true);

      expect(disposals.length).toBe(1);
      const [{
        gain,
        qty,
        proceeds,
      }] = disposals;
      expect(gain.eq('1650')).toBe(true); // (1750 - 100)
      expect(proceeds.eq('6000')).toBe(true);
      expect(qty.eq('4000')).toBe(true);
    });

    const example3Trades = [{
      id: '#1',
      type: 'BUY',
      date: new Date('2015-04-01T09:00:00.000Z'),
      description: 'Bought 1000 shares in Lobster plc for 400p per share plus £150 fees',
      qty: new Big('1000'),
      total: new Big('4150'), // includes fee
      fee: new Big('150'),
      raw: {},
    }, {
      id: '#2',
      type: 'BUY',
      date: new Date('2018-09-01T09:00:00.000Z'),
      description: 'Bought 500 shares in Lobster plc for 410p per share plus £80 fees',
      qty: new Big('500'),
      total: new Big('2130'), // includes fee
      fee: new Big('80'),
      raw: {},
    }, {
      id: '#3',
      type: 'SELL',
      date: new Date('2023-05-01T09:00:00.000Z'),
      description: 'Sold 700 shares in Lobster plc for 480p per share (£3360) incurring £100 fees',
      qty: new Big('700'),
      total: new Big('3260'), // net of fee
      fee: new Big('100'),
      raw: {},
    }, {
      id: '#4',
      type: 'SELL',
      date: new Date('2024-02-01T09:00:00.000Z'),
      description: 'Sold 400 shares in Lobster plc for 520p per share (£2080) incurring £105 fees',
      qty: new Big('400'),
      total: new Big('1975'), // net of fee
      fee: new Big('105'),
      raw: {},
    }];
    it('should follow example 3', () => {
      const trades = example3Trades.slice(0, 3);
      const tp = new TradeProcessor({
        asset: 'Lobster plc',
        currency: GBP,
      });

      const {
        disposals,
        pool: {
          qty: poolQty,
          cost: poolCost,
        },
      } = tp.process(trades);
      expect(poolQty.eq('800')).toBe(true);
      expect(poolCost.toFixed(0)).toBe('3349');

      expect(disposals.length).toBe(1);
      const [{
        gain,
        qty,
        proceeds,
      }] = disposals;
      expect(gain.toFixed(0)).toBe('329');
      expect(proceeds.toFixed(0)).toBe('3260');
      expect(qty.toFixed(0)).toBe('700');
    });

    it('should follow example 3 - continued', () => {
      const trades = example3Trades;
      const tp = new TradeProcessor({
        asset: 'Lobster plc',
        currency: GBP,
      });

      const {
        disposals,
        pool: {
          qty: poolQty,
          cost: poolCost,
        },
      } = tp.process(trades);
      expect(poolQty.eq('400')).toBe(true);
      // the example rounds costs up and gains down
      // we must round this down
      expect(poolCost.toFixed(0, 0)).toBe('1674');

      expect(disposals.length).toBe(2);
      const [, {
        gain,
        qty,
        proceeds,
      }] = disposals;
      expect(gain.toFixed(0)).toBe('300');
      expect(proceeds.toFixed(0)).toBe('1975');
      expect(qty.toFixed(0)).toBe('400');
    });
  }); // examples
});
