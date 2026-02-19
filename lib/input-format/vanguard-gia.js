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

    const cashFeesOnly = cashRecords
      .filter((r) => r.Details.startsWith('ETF dealing fee'))
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
          asset: new Unit(assetName), // TODO: link up name here
          currency: GBP,
          trades: [],
        });
      }
      // now we know this will always yield something
      const thisAsset = byAsset.get(assetName);
      const investmentRecordDate = VanguardGIA.toDate(ir.Date);
      // if there is an associated fee what would it look like?
      const feeDetails = `ETF dealing fee (${type.toLowerCase()}) ${assetName}`;
      const matchingFee = cashFeesOnly.find((f) => !f.matchedWithInvestment
        && f.Details === feeDetails
        && daysBetween(VanguardGIA.toDate(f.Date), investmentRecordDate) < 7);
      debug(
        'Searching for a fee week prior to %s with Details "%s", found? %s',
        investmentRecordDate,
        feeDetails,
        matchingFee || false
      );
      const toBigAbs = (given) => new Big(given.replace(/,/g, '')).abs();
      let fee;
      if (matchingFee) {
        matchingFee.matchedWithInvestment = true;
        fee = toBigAbs(matchingFee.Amount);
      } else {
        fee = ZERO;
      }

      // TODO: part of "re-evaluating total net of fee" task
      const total = type === 'BUY'
        ? toBigAbs(ir.Cost).plus(fee)
        : toBigAbs(ir.Cost).minus(fee);
      thisAsset.trades.push({
        id: v4(),
        // TODO: I think this is settlement date, not actual transaction date
        date: investmentRecordDate,
        type,
        qty: toBigAbs(ir.Quantity),
        total,
        fee,
        description: details,
        raw: ir,
      });
    });

    return Array.from(byAsset.values());
  }
}

module.exports = VanguardGIA;
