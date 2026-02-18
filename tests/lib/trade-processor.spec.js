const { Big, ZERO } = require('../../lib/big-wrapper');
const TradeProcessor = require('../../lib/trade-processor');

describe('TradeProcessor', () => {
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
        currency: 'GBP',
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
  });
});
