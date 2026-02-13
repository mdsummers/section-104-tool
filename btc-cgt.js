const fs = require('fs');
const assert = require('assert');
const { parse } = require('csv-parse/sync');
const Big = require('big.js');
const debug = require('debug');

// debug streams
const debugMatching = debug('btc-cgt:matching');
const debugDays = debug('btc-cgt:days');
const debugInput = debug('btc-cgt:input');

// add safeguard to avoid causing precision loss
Big.strict = true;
Big.DP = 40;
// Default rounding method is Big.roundHalfUp
// Uncomment to switch to rounding up
// Big.RM = Big.roundUp;
const ZERO = new Big('0');

// ===== CONFIG =====
const FILE = './without-deposits.csv';
const ASSET = 'BTC';

// Reporting in UK, use Europe/London
process.env.TZ = 'Europe/London';

// ===== HELPERS =====
function toBig (v) {
  if (!v) return 0;
  return new Big(String(v).replace(/[£,]/g, '').trim());
}

// Math.min equivalent
function bigMin (a, b) {
  assert(a instanceof Big, 'bigMin() a not instanceof Big');
  assert(b instanceof Big, 'bigMin() b not instanceof Big');
  return a.lt(b) ? a : b;
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function formatDate (date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    hour12: false,
  });

  // "Dec 21, 13:01" → remove the comma
  return formatter.format(date).replace(',', ' at');
}

function formatGbp (given) {
  assert(given instanceof Big, 'formatGbp() given not instanceof Big');
  const isNegative = given.lt(ZERO);
  return [
    isNegative ? '-' : '',
    '£',
    given.abs().toFixed(2)
  ].join('');
}

function log (...args) {
  // allow us to wrap this later
  console.log(...args);
}

const COLSIZE = 20;
const LC_S104OPTS = { sizes: [0, 10] };
const LC_30DMATCH = { sizes: [0, 50, 1, 10] };
function logColumns (cols, {
  sizes = new Array(cols.length).fill(COLSIZE),
} = {}) {
  log(cols.map((c, i) => c.padStart(sizes[i] || COLSIZE, ' ')).join(' '));
}

// POOL MANAGEMENT
let poolFormed = false;
function addToPool (qty, cost) {
  assert(qty instanceof Big, 'addToPool() qty not instanceof Big');
  assert(cost instanceof Big, 'addToPool() cost not instanceof Big');
  log();
  if (!poolFormed) {
    poolFormed = true;
    poolQty = qty;
    poolCost = cost;
    log('The section 104 holding is formed');
    const colsize = 20;
    logColumns([
      '',
      '',
      'BTC quantity',
      'Pool of actual cost',
    ], LC_S104OPTS);
    logColumns([
      '',
      '',
      poolQty.toFixed(8),
      formatGbp(poolCost)
    ], LC_S104OPTS);
    log();

    return;
  }

  logColumns([
    '',
    '',
    'BTC quantity',
    'Pool of actual cost',
  ], LC_S104OPTS);
  logColumns([
    'Brought forward',
    '',
    poolQty.toFixed(8),
    formatGbp(poolCost)
  ], LC_S104OPTS);
  logColumns([
    '',
    'plus',
    qty.toFixed(8),
    formatGbp(cost),
  ], LC_S104OPTS);
  logColumns([
    '',
    '',
    '-'.repeat(COLSIZE),
    '-'.repeat(COLSIZE),
  ], LC_S104OPTS);
  poolQty = poolQty.plus(qty);
  poolCost = poolCost.plus(cost);
  logColumns([
    'Carried forward',
    '',
    poolQty.toFixed(8),
    formatGbp(poolCost)
  ], LC_S104OPTS);
  log();

}

function removeFromPool (qty, cost) {

}

// ===== LOAD CSV =====
const raw = fs.readFileSync(FILE, 'utf8');

// Remove first metadata row if present
const lines = raw.split('\n').slice(1).join('\n');

const records = parse(lines, {
  columns: true,
  skip_empty_lines: true,
});

// ===== NORMALISE TRADES =====
let trades = records
  .filter(r => r['Asset'] === ASSET)
  .map((r) => ({
    ...r,
    'Transaction Type': r['Transaction Type'].toUpperCase().replace(/^.* /, ''),
  }))
  .filter(r => ['BUY', 'SELL'].includes(r['Transaction Type']))
  .map(r => {
    debugInput(r);
    const tsToDate = (given) => {
      const split = given.split(' ');
      return `${split[0]}T${split[1]}Z`;
    };
    const date = new Date(tsToDate(r['Timestamp']));

    const qty = toBig(r['Quantity Transacted']).abs(); // quantity negative for sales
    const price = toBig(r['Price']);
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
      raw: r
    };
  })
  .sort((a, b) => a.date - b.date);

// ===== MATCHING STRUCTURES =====
let poolQty = ZERO;
let poolCost = ZERO;
let buyFees = ZERO;
let sellFees = ZERO;

let futureBuys = []; // for 30-day matching
let results = [];

// Pre-store buys for 30-day matching
trades.forEach(t => {
  if (t.type === 'BUY') {
    futureBuys.push({ ...t, remaining: t.qty });
  }
});

// ===== PROCESS TRADES =====
for (let i = 0; i < trades.length; i++) {
  const t = trades[i];

  log(`On ${formatDate(t.date)} I ${t.description}`);

  if (t.type === 'SELL') {
    // add to the fee straightaway
    sellFees = sellFees.plus(t.fee);

    let remaining = t.qty;
    let disposalProceeds = t.total.abs(); // already net of fee
    let gain = ZERO;

    // ===== 1. SAME-DAY MATCHING =====
    const sameDayBuys = trades.filter(b =>
      b.type === 'BUY' &&
      b.date.toDateString() === t.date.toDateString() &&
      b.qty.gt(ZERO)
    );

    debugMatching('There are %d same day buys for sell %s', sameDayBuys.length, t.id);
    if (sameDayBuys.length) throw new Error('Same day logic not implemented');
    /*
    for (const b of sameDayBuys) {
      if (remaining.lte(ZERO)) break;

      const matchQty = bigMin(remaining, b.qty);
      const costPortion = b.total.div(b.qty).times(matchQty);

      gain = gain.plus(disposalProceeds.div(t.qty).times(matchQty)).minus(costPortion);

      b.qty = b.qty.minus(matchQty);
      remaining = remaining.minus(matchQty);
    }
    */

    // ===== 2. 30-DAY MATCHING =====
    debugMatching('There are %d future buys for sell %s, looking to match quantity: %s', futureBuys.length, t.id, remaining);
    for (const b of futureBuys) {
      if (remaining.lte(ZERO)) break;
      if (b.remaining.lte(ZERO)) continue;

      const d = daysBetween(t.date, b.date);
      debugDays('Days between sell:%s and buy:%s is %d', t.id, b.id, d);
      if (d > 0 && d <= 30) {
        const matchQty = bigMin(remaining, b.remaining);
        debugMatching('matched %s from buy:%s (within 30 days)', matchQty, b.id);
        log();
        log(
          '%s of this quantity is matched with the buy on %s',
          matchQty.toFixed(8),
          formatDate(b.date)
        );

        // disposalProceeds already has fee removed
        const proportionOfFullDisposal = matchQty.div(t.qty);
        const matchedDisposalProceeds = proportionOfFullDisposal.times(disposalProceeds);
        log();
        logColumns([
          'Disposal Proceeds',
          `(apportioned ${matchQty.toFixed(8)} / ${t.qty.toFixed(8)} * ${disposalProceeds.toFixed(2)})`,
          '=',
          formatGbp(matchedDisposalProceeds)
        ], LC_30DMATCH);

        const proportionOfMatchedBuy = matchQty.div(b.qty);
        const allowableCost = proportionOfMatchedBuy.times(b.total);
        logColumns([
          'Allowable cost',
          `(apportioned ${matchQty.toFixed(8)} / ${b.qty.toFixed(8)} * ${b.total.toFixed(2)})`,
          '=',
          formatGbp(allowableCost)
        ], LC_30DMATCH);
        const thisGain = matchedDisposalProceeds.minus(allowableCost);
        gain = gain.plus(thisGain);
        logColumns([
          'Total gain',
          '(Disposal proceeds - Allowable cost)',
          '=',
          formatGbp(thisGain)
        ], LC_30DMATCH);

        b.remaining = b.remaining.minus(matchQty);
        remaining = remaining.minus(matchQty);
        debugMatching('buy:%s has %s remaining, we still need to match %s from sale', b.id, b.remaining, remaining);
      }
    } // foreach futureBuys

    // ===== 3. SECTION 104 POOL =====
    if (remaining.gt(ZERO)) {
      throw new Error('Disposal -> section 104 considerations are not tested');
      const poolCostPerBTC = poolQty.gt(0) ? poolCost.div(poolQty) : ZERO;
      const costPortion = poolCostPerBTC.times(remaining);

      gain = gain.plus(disposalProceeds.div(t.qty).times(remaining)).minus(costPortion);

      poolQty = poolQty.minus(remaining);
      poolCost = poolCost.minus(costPortion);
      remaining = ZERO;
    }

    results.push({
      date: t.date.toISOString().slice(0, 10),
      qty: t.qty,
      proceeds: disposalProceeds,
      gain
    });
  }

  // ===== AFTER PROCESSING, ADD BUYS TO POOL (UNMATCHED ONLY) =====
  if (t.type === 'BUY') {
    buyFees = buyFees.plus(t.fee);
    const buyWithRemaining = futureBuys.find(b => b.id === t.id);
    if (!buyWithRemaining) {
      throw new Error('There should always be a copy in futureBuys');
    }

    const unmatchedQty = buyWithRemaining.remaining;
    debugMatching('Considering adding to pool. Unmatched quantity: %s', unmatchedQty);
    // two cases here
    // Full match (remaining === 0)
    // partial match (remaining !== t.qty)
    if (unmatchedQty.eq(ZERO)) {
      log();
      log('Not considered wrt. Section 104 Holding because of previous disposal');
    } else if (unmatchedQty.gt(ZERO)) {
      if (!unmatchedQty.eq(t.qty)) {
        const previouslyMatched = t.qty.minus(unmatchedQty);
        log();
        log(
          'Quantity %s was previously matched under 30 day rules, leaving %s for Section 104 consideration',
          previouslyMatched.toFixed(8),
          unmatchedQty.toFixed(8),
        );
      }
      debugMatching('Costing: total=%s, quantity=%s, of which unmatched=%s', t.total, t.qty, unmatchedQty);
      const costPortion = t.total.div(t.qty).times(unmatchedQty);

      addToPool(unmatchedQty, costPortion);
    } else {
      log(unmatchedQty, t.total, t.qty, costPortion);
      throw new Error('Unhandled condition');
    }
  }
  log(); // line pad post trade
}

// ===== OUTPUT =====
console.log('Disposals:');
let totalGain = ZERO;
results.forEach(r => {
  console.log(`${r.date} | Sold ${r.qty} BTC | Gain/Loss £${r.gain.toFixed(2)}`);
  totalGain = totalGain.plus(r.gain);
});
console.log('Total gain over timeframe:', formatGbp(totalGain));

console.log('\nSection 104 Pool:');
console.log(`BTC: ${poolQty}`);
console.log(`Cost: £${poolCost.toFixed(2)}`);
console.log(`Fees: £${(buyFees.plus(sellFees)).toFixed(2)}`);
console.log(`of which buy/sell: £${buyFees.toFixed(2)}/£${sellFees.toFixed(2)}`);
