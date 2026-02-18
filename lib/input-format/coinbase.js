const assert = require('assert');
// unclear why eslint is unable to resolve
// eslint-disable-next-line import/no-unresolved
const { parse } = require('csv-parse/sync');
const debugInput = require('debug')('btc-cgt:input');
const {
  Big,
} = require('../big-wrapper');
const {
  Bitcoin,
} = require('../asset');
const {
  GBP,
} = require('../currency');

function toBig (v) {
  if (!v) return 0;
  return new Big(String(v).replace(/[£,]/g, '').trim());
}

class CoinbaseExport {
  constructor (input) {
    assert(CoinbaseExport.matches(input), 'Invalid input for CoinbaseExport');
    this.input = input;
  }

  static matches (input) {
    const split = input.split('\n');
    if (split[0] === '') split.shift();
    return split.length >= 3
      && split[0].startsWith('Transactions')
      && split[1].startsWith('User,')
      && split[2].startsWith('ID,');
  }

  extractAssetTrades () {
    const lines = this.input.split('\n');
    // remove metadata lines
    while (!lines[0].startsWith('ID,')) {
      lines.shift();
    }
    // input to records
    const records = parse(lines.join('\n'), {
      columns: true,
      skip_empty_lines: true,
    });
    // records to normalized trades
    const trades = records
      .filter((r) => r.Asset === 'BTC')
      .map((r) => ({
        ...r,
        'Transaction Type': r['Transaction Type'].toUpperCase().replace(/^.* /, ''),
      }))
      .filter((r) => ['BUY', 'SELL'].includes(r['Transaction Type']))
      .map((r) => {
        debugInput(r);
        const tsToDate = (given) => {
          const split = given.split(' ');
          return `${split[0]}T${split[1]}Z`;
        };
        const date = new Date(tsToDate(r.Timestamp));

        const qty = toBig(r['Quantity Transacted']).abs(); // quantity negative for sales
        // unused
        // const price = toBig(r['Price at Transaction']);
        const fee = toBig(r['Fees and/or Spread']);
        // Represents GBP spent (BUY) or received (SELL). i.e.
        // for BUY, total = BTC cost + Fee
        // for SELL, total = sale proceeds - Fee
        const total = toBig(r['Total (inclusive of fees and/or spread)']);

        return {
          id: r.ID,
          date,
          type: r['Transaction Type'],
          qty,
          fee,
          total,
          description: r.Notes,
          raw: r,
        };
      })
      .sort((a, b) => a.date - b.date);

    return [{
      trades,
      currency: GBP,
      asset: new Bitcoin(),
    }];
  }
}

module.exports = CoinbaseExport;
