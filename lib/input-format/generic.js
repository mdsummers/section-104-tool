const assert = require('assert');
// eslint-disable-next-line import/no-unresolved
const { parse } = require('csv-parse/sync');
const { v4 } = require('uuid');
const debug = require('debug')('s104:input');
const { GBP } = require('../currency');
const {
  Big,
  ZERO,
} = require('../big-wrapper');
const { Share } = require('../asset');

class Generic {
  constructor (input) {
    assert(Generic.matches(input), 'Invalid input for CoinbaseExport');
    this.input = input.replace(/\r/g, '');
  }

  static matches (input) {
    const split = input.split('\n');
    return split[0].toUpperCase().startsWith('FORMAT,GENERIC');
  }

  extractAssetTrades () {
    const isStr = (given) => typeof given === 'string';

    const lines = this.input.split('\n');
    const withDateHeader = lines.findIndex((l) => l.startsWith('Date,'));
    const metadataSection = lines.slice(0, withDateHeader - 1);
    const recordsSection = lines.slice(withDateHeader);
    debug('Extracted %d metadata lines and %d records lines', metadataSection.length, recordsSection.length);
    const metadata = Generic.parseMetadataLines(metadataSection);
    const records = parse(recordsSection.join('\n'), {
      columns: true,
      skip_empty_lines: true,
    });
    debug('Extracted metadata:', metadata);
    const {
      Share: share,
    } = metadata;
    assert(
      isStr(share) && share.length,
      'Missing Share field in metadata'
    );
    debug('Extracted %d records', records.length);
    debug('First record', records.at(0));
    debug('Last record', records.at(-1));

    const trades = records.map((t) => {
      // TODO - flexible date parsing
      assert(
        isStr(t.Date) && t.Date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
        'Expected date in format YYYY-MM-DD'
      );
      const type = t.Type?.toUpperCase();
      assert(
        isStr(type) && ['BUY', 'SELL'].includes(type),
        'Expected type to be one of BUY or SELL'
      );
      assert(isStr(t.Quantity), 'Quantity not a string');
      assert(isStr(t.Total), 'Total not a string');
      assert(isStr(t.Fee), 'Fee not a string');
      const date = new Date(`${t.Date}T12:00:00.000Z`);
      const fee = t.Fee ? new Big(t.Fee) : ZERO;
      const proceeds = new Big(t.Total);
      return {
        id: v4(),
        date,
        dateOnly: true,
        type,
        qty: new Big(t.Quantity),
        // TODO: More "net fee" business
        total: type === 'SELL' ? proceeds.minus(fee) : proceeds,
        fee,
        description: t.Description || 'TODO',
        raw: t,
      };
    });
    // TODO: Assert trades ordered
    return [{
      asset: new Share(share),
      currency: GBP,
      trades,
    }];
  }

  static parseMetadataLines (lines) {
    const entries = lines.map((l) => {
      const matched = l.match(/^([^,]+),(.*?),*$/);
      if (!matched) {
        debug('Failed to parse metadata line:', l);
        throw new Error('Failed to parse metadata');
      }
      return [matched[1], matched[2]];
    });

    return Object.fromEntries(entries);
  }
}

module.exports = Generic;
