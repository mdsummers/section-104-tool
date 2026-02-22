const { readFileSync } = require('fs');
const InputFormat = require('../../../lib/input-format');
const Generic = require('../../../lib/input-format/generic');
const { Asset } = require('../../../lib/asset');
const { Currency } = require('../../../lib/currency');
const TradeProcessor = require('../../../lib/trade-processor');

describe('Generic', () => {
  beforeEach(() => {
    // eslint-disable-next-line global-require
    global.console = require('console');
  });

  it.each([
    [6, '01-alpha.csv'],
    [7, '02-beta.csv'],
    [7, '03-gamma.csv'],
    [6, '04-delta.csv'],
    [6, '05-epsilon.csv'],
    [13, '06-zeta.csv'],
    [6, '08-iota.csv'], // has BUY fees
    [6, '09-kappa.csv'], // has empty fees
  ])('should yield %d processable trades from %s', (tradeCount, filename) => {
    const contents = readFileSync(
      `${__dirname}/../../fixtures/generic/${filename}`,
      'utf8'
    );
    const input = InputFormat.from(contents);
    expect(input).toBeInstanceOf(Generic);
    const [{
      asset,
      currency,
      trades,
    }] = input.extractAssetTrades();
    expect(trades.length).toBe(tradeCount);
    expect(asset).toBeInstanceOf(Asset);
    expect(currency).toBeInstanceOf(Currency);
    const tp = new TradeProcessor({ asset, currency });
    tp.process(trades);
  });
  it.each([
    ['07-theta.csv', /Same day logic/],
    ['01-alpha-negative-pool.csv', /Cannot remove more than exists/],
  ])('should fail to process trades from %s with %p', (filename, pattern) => {
    const contents = readFileSync(
      `${__dirname}/../../fixtures/generic/${filename}`,
      'utf8'
    );
    const input = InputFormat.from(contents);
    expect(input).toBeInstanceOf(Generic);
    const [{
      asset,
      currency,
      trades,
    }] = input.extractAssetTrades();
    expect(asset).toBeInstanceOf(Asset);
    expect(currency).toBeInstanceOf(Currency);
    const tp = new TradeProcessor({ asset, currency });
    expect(() => tp.process(trades)).toThrow(pattern);
  });

  it.each([
    ['e01-invalid-metadata.csv', /Failed to parse metadata/],
    ['e02-no-share.csv', /share field/i],
    ['e03-invalid-date.csv', /Expected date in format/i],
  ])('should fail to extract trades from %s due to %p', (filename, pattern) => {
    const contents = readFileSync(
      `${__dirname}/../../fixtures/generic/${filename}`,
      'utf8'
    );
    const input = InputFormat.from(contents);
    expect(input).toBeInstanceOf(Generic);
    expect(() => input.extractAssetTrades()).toThrow(pattern);
  });

  it('should parse the share name from the CSV', () => {
    const contents = readFileSync(
      `${__dirname}/../../fixtures/generic/01-alpha.csv`,
      'utf8'
    );
    const input = InputFormat.from(contents);
    expect(input).toBeInstanceOf(Generic);
    const [{
      asset,
    }] = input.extractAssetTrades();
    expect(asset.toString()).toBe('Shares of Alpha plc');
  });
});
