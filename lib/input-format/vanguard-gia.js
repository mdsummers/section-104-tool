const assert = require('assert');
// eslint-disable-next-line import/no-unresolved
const { parse } = require('csv-parse/sync');
const debug = require('debug')('s104:input');
const { v4 } = require('uuid');
const { Unit } = require('../asset');
const { GBP } = require('../currency');
const {
  Big,
  ZERO,
} = require('../big-wrapper');
const { daysBetween } = require('../util');

class VanguardGIA {
  constructor (input) {
    assert(VanguardGIA.matches(input), 'Invalid input for VanguardGIA');
    this.input = input.replace(/\r/g, '');
  }

  static matches (input) {
    const split = input.split('\n');
    if (!split[0].startsWith('GIA')) return false;
    if (!split[2].startsWith('Cash Transactions')) return false;
    if (!split[4].startsWith('Date,Details,Amount,Balance,,')) return false;
    const investmentIndex = split.findIndex((s) => s.startsWith('Investment Transactions'));
    if (!investmentIndex) return false;
    return split[investmentIndex + 2].startsWith('Date,InvestmentName,TransactionDetails,Quantity,Price,Cost');
  }

  static collectSection (lines, startPattern, endPattern) {
    const result = [];
    let collecting = false;

    // eslint-disable-next-line no-restricted-syntax
    for (const line of lines) {
      if (!collecting && startPattern.test(line)) {
        collecting = true;
        result.push(line); // include the line that matched start
        continue;
      }

      if (collecting) {
        if (endPattern.test(line)) {
          break; // stop before end pattern (do not include it)
        }
        result.push(line);
      }
    }

    return result;
  }

  static toDate (given) {
    const [day, month, year] = given.split('/');
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  }

  static assertOrdered (records) {
    const { Date: firstDateValue } = records.at(0);
    const { Date: lastDateValue } = records.at(-1);
    const firstDate = VanguardGIA.toDate(firstDateValue);
    const lastDate = VanguardGIA.toDate(lastDateValue);
    assert(firstDate <= lastDate, `Records not correctly ordered, first date seen was ${firstDateValue}, last was ${lastDateValue}`);
  }

  extractAssetTrades () {
    const lines = this.input.split('\n');
    const cashSection = VanguardGIA.collectSection(
      lines,
      /^Date,Details,Amount,Balance/,
      /^Balance,/
    );
    const investmentSection = VanguardGIA.collectSection(
      lines,
      /^Date,InvestmentName,TransactionDetails,Quantity,Price,Cost/,
      /^Cost,/
    );

    debug('Extracted %d cash lines and %d investment lines', cashSection.length, investmentSection.length);
    const cashRecords = parse(cashSection.join('\n'), {
      columns: true,
      skip_empty_lines: true,
    });
    // For some reason the cashRecords are in ascending order but
    // the investment records are in descending order.
    const investmentRecords = parse(investmentSection.join('\n'), {
      columns: true,
      skip_empty_lines: true,
    }).reverse();
    debug('Extracted %d cash records and %d investment records', cashRecords.length, investmentRecords.length);
    debug('first cash record', cashRecords[0]);
    debug('first investment record', investmentRecords[0]);
    VanguardGIA.assertOrdered(cashRecords);
    VanguardGIA.assertOrdered(investmentRecords);

    const cashRecordsOfInterest = cashRecords
      .filter((r) => r.Details.startsWith('ETF dealing fee')
        || r.Details.startsWith('Bought')
        || r.Details.startsWith('Sold'))
      .map((r) => ({
        ...r,
        matchedWithInvestment: false,
      }));

    const byAsset = new Map();
    investmentRecords.forEach((ir) => {
      let type;
      const details = ir.TransactionDetails;
      if (details.startsWith('Bought')) {
        type = 'BUY';
      } else if (details.startsWith('Sold')) {
        type = 'SELL';
      } else {
        return; // unknown
      }
      // e.g. S&P 500 UCITS ETF - Distributing (VUSA)
      const assetName = ir.InvestmentName;
      if (!byAsset.has(assetName)) {
        byAsset.set(assetName, {
          asset: new Unit(assetName),
          currency: GBP,
          trades: [],
        });
      }
      // now we know this will always yield something
      const thisAsset = byAsset.get(assetName);
      const investmentRecordDate = VanguardGIA.toDate(ir.Date);
      // if there is an associated fee what would it look like?
      const matchingCashRecordIndex = cashRecordsOfInterest
        .findIndex((r) => !r.matchedWithInvestment
          && r.Details === details);
      debug(
        'Searching for first unmatched cash record with details="%s"',
        details
      );
      assert(matchingCashRecordIndex !== -1, 'Could not find matching cash record, use DEBUG=s104:input for details');
      const matchingCashRecord = cashRecordsOfInterest.at(matchingCashRecordIndex);
      // avoid matching again
      matchingCashRecord.matchedWithInvestment = true;
      const cashRecordDate = VanguardGIA.toDate(matchingCashRecord.Date);

      // check for a fee in the next row
      const maybeFee = cashRecordsOfInterest.at(matchingCashRecordIndex + 1);
      const feeDetails = `ETF dealing fee (${type.toLowerCase()}) ${assetName}`;

      const toBigAbs = (given) => new Big(given.replace(/,/g, '')).abs();

      let fee;
      if (maybeFee && maybeFee.Details === feeDetails) {
        // our logic makes a few assumptions here, assert as much
        debug('Found a fee in the index following the cash record:', maybeFee);
        assert(!maybeFee.matchedWithInvestment, 'Fee already matched, failed assumption');
        debug('Date of cash record: %s', maybeFee.Date);
        debug('Date of investment record: %s', ir.Date);
        assert(
          daysBetween(VanguardGIA.toDate(maybeFee.Date), investmentRecordDate) < 7,
          'Fee settled 7 or more days after cash record, unlikely to be a true match'
        );

        maybeFee.matchedWithInvestment = true;
        fee = toBigAbs(maybeFee.Amount);
      } else {
        fee = ZERO;
      }

      // TODO: part of "re-evaluating total net of fee" task
      const total = type === 'BUY'
        ? toBigAbs(ir.Cost).plus(fee)
        : toBigAbs(ir.Cost).minus(fee);
      thisAsset.trades.push({
        id: v4(),
        date: cashRecordDate,
        type,
        qty: toBigAbs(ir.Quantity),
        total,
        fee,
        description: details,
        raw: ir,
      });
    });

    const unmatchedRecords = cashRecordsOfInterest.filter((r) => !r.matchedWithInvestment);
    debug('Cash records unmatched with investment records:', unmatchedRecords);
    assert(
      !unmatchedRecords.length,
      'There were unmatched cash records. Use DEBUG=s104:input for more details'
    );

    return Array.from(byAsset.values());
  }
}

module.exports = VanguardGIA;
