const fs = require('fs');
const { parse } = require('csv-parse/sync');
const debug = require('debug')('btc-cgt:matching');
const debugDays = require('debug')('btc-cgt:days');
const debugGain = require('debug')('btc-cgt:gain');

// ===== CONFIG =====
const FILE = './without-deposits.csv';
const ASSET = 'BTC';

// Reporting in UK, use Europe/London
process.env.TZ = 'Europe/London';

// ===== HELPERS =====
function toNumber(v) {
  if (!v) return 0;
  return Number(String(v).replace(/[£,]/g, '').trim());
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function formatDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // "Dec 21, 13:01" → remove the comma
  return formatter.format(date).replace(',', ' at');
}

function log (...args) {
  // allow us to wrap this later
  console.log(...args);
}

const COLSIZE = 20;
function logColumns (cols) {
  log(cols.map((c) => c.padStart(COLSIZE, ' ')).join(' '));
}

// POOL MANAGEMENT
let poolFormed = false;
function addToPool (qty, cost) {
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
    ]);
    logColumns([
      '',
      '',
      poolQty.toFixed(8),
      poolCost.toFixed(2),
    ]);
    log();

    return;
  }

  logColumns([
    '',
    '',
    'BTC quantity',
    'Pool of actual cost',
  ]);
  logColumns([
    'Brought forward',
    '',
    poolQty.toFixed(8),
    poolCost.toFixed(2),
  ]);
  logColumns([
    '',
    'plus',
    qty.toFixed(8),
    cost.toFixed(2),
  ]);
  logColumns([
    '',
    '',
    '-'.repeat(COLSIZE),
    '-'.repeat(COLSIZE),
  ]);
  poolQty += qty;
  poolCost += cost;
  logColumns([
    'Carried forward',
    '',
    poolQty.toFixed(8),
    poolCost.toFixed(2),
  ]);
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
    const tsToDate = (given) => {
      const split = given.split(' ');
      return `${split[0]}T${split[1]}Z`;
    };
    const date = new Date(tsToDate(r['Timestamp']));

    const qty = Math.abs(toNumber(r['Quantity Transacted'])); // quantity negative for sales
    const price = toNumber(r['Price']);
    const fee = toNumber(r['Fees and/or Spread']);
    const total = toNumber(r['Total (inclusive of fees and/or spread)']);

    return {
      id: r.ID,
      date,
      type: r['Transaction Type'],
      qty,
      fee,
      total, // GBP spent (BUY) or received (SELL) AFTER fee depending on export
      description: r.Notes,
      raw: r
    };
  })
  .sort((a, b) => a.date - b.date);

// ===== MATCHING STRUCTURES =====
let poolQty = 0;
let poolCost = 0;
let buyFees = 0;
let sellFees = 0;

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
    sellFees += t.fee;

    let remaining = t.qty;
    let disposalProceeds = t.total; // already net of fee
    let gain = 0;

    // ===== 1. SAME-DAY MATCHING =====
    const sameDayBuys = trades.filter(b =>
      b.type === 'BUY' &&
      b.date.toDateString() === t.date.toDateString() &&
      b.qty > 0
    );

    debug('There are %d same day buys for sell %s', sameDayBuys.length, t.id);
    if (sameDayBuys.length) throw new Error('Same day logic not implemented');
    /*
    for (const b of sameDayBuys) {
      if (remaining <= 0) break;

      const matchQty = Math.min(remaining, b.qty);
      const costPortion = (b.total / b.qty) * matchQty;

      gain += (disposalProceeds / t.qty) * matchQty - costPortion;

      b.qty -= matchQty;
      remaining -= matchQty;
    }
    */

    // ===== 2. 30-DAY MATCHING =====
    debug('There are %d future buys for sell %s, looking to match quantity: %s', futureBuys.length, t.id, remaining);
    for (const b of futureBuys) {
      if (remaining <= 0) break;
      if (b.remaining <= 0) continue;

      const d = daysBetween(t.date, b.date);
      debugDays('Days between sell:%s and buy:%s is %d', t.id, b.id, d);
      if (d > 0 && d <= 30) {
        const matchQty = Math.min(remaining, b.remaining);
        debug('matched %s from buy:%s (within 30 days)', matchQty, b.id);
        const costPortion = (b.total / b.qty) * matchQty;
        log(
          '%s of this quantity is matched with the buy on %s',
          matchQty.toFixed(8),
          formatDate(b.date)
        );

        debugGain(
          'disposalProceeds=%s, quantity=%s, matched=%s, costPortion=%s',
          disposalProceeds,
          t.qty,
          matchQty,
          costPortion,
        );
        debugGain('(disposalProceeds / quantity) * matched - costPortion');
        debugGain(
          '(%s / %s) * %s - %s)',
          disposalProceeds,
          t.qty,
          matchQty,
          costPortion,
        );
        const thisGain = (disposalProceeds / t.qty) * matchQty - costPortion;
        debugGain('= %s', thisGain);
        gain += thisGain;

        b.remaining -= matchQty;
        remaining -= matchQty;
        debug('buy:%s has %s remaining, we still need to match %s from sale', b.id, b.remaining, remaining);
      }
    } // foreach futureBuys

    // ===== 3. SECTION 104 POOL =====
    if (remaining > 0) {
      const poolCostPerBTC = poolQty > 0 ? poolCost / poolQty : 0;
      const costPortion = poolCostPerBTC * remaining;

      gain += (disposalProceeds / t.qty) * remaining - costPortion;

      poolQty -= remaining;
      poolCost -= costPortion;
      remaining = 0;
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
    buyFees += t.fee;
    const buyWithRemaining = futureBuys.find(b => b.id === t.id);
    if (!buyWithRemaining) {
      throw new Error('There should always be a copy in futureBuys');
    }

    const unmatchedQty = buyWithRemaining.remaining;
    debug('Considering adding to pool. Unmatched quantity: %s', unmatchedQty);
    // two cases here
    // Full match (remaining === 0)
    // partial match (remaining !== t.qty)
    if (unmatchedQty === 0) {
      log();
      log('Not considered wrt. Section 104 Holding because of previous disposal');
    } else if (unmatchedQty > 0) {
      if (unmatchedQty !== t.qty) {
        const previouslyMatched = t.qty - unmatchedQty;
        log();
        log(
          'Quantity %s was previously matched under 30 day rules, leaving %s for Section 104 consideration',
          previouslyMatched.toFixed(8),
          unmatchedQty.toFixed(8),
        );
      }
      debug('Costing: total=%s, quantity=%s, of which unmatched=%s', t.total, t.qty, unmatchedQty);
      const costPortion = (t.total / t.qty) * unmatchedQty;

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
results.forEach(r => {
  console.log(`${r.date} | Sold ${r.qty} BTC | Gain/Loss £${r.gain.toFixed(2)}`);
});

console.log('\nSection 104 Pool:');
console.log(`BTC: ${poolQty}`);
console.log(`Cost: £${poolCost.toFixed(2)}`);
console.log(`Fees: £${(buyFees + sellFees).toFixed(2)}`);
console.log(`of which buy/sell: £${buyFees.toFixed(2)}/£${sellFees.toFixed(2)}`);
