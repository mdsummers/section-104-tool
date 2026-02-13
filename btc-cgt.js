const fs = require('fs');
const { parse } = require('csv-parse/sync');
const debug = require('debug')('btc-cgt:matching');
const debugDays = require('debug')('btc-cgt:days');
const debugGain = require('debug')('btc-cgt:gain');

// ===== CONFIG =====
const FILE = './without-deposits.csv';
const ASSET = 'BTC';

// ===== HELPERS =====
function toNumber(v) {
  if (!v) return 0;
  return Number(String(v).replace(/[£,]/g, '').trim());
}

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
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
    const fee = toNumber(r['Fee']);
    const total = toNumber(r['Total (inclusive of fees and/or spread)']);

    return {
      id: r.ID,
      date,
      type: r['Transaction Type'],
      qty,
      fee,
      total, // GBP spent (BUY) or received (SELL) AFTER fee depending on export
      raw: r
    };
  })
  .sort((a, b) => a.date - b.date);

// ===== MATCHING STRUCTURES =====
let poolQty = 0;
let poolCost = 0;

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

  if (t.type === 'BUY') {
    // Add to pool AFTER potential 30-day matching later
    // continue;
  }

  if (t.type === 'SELL') {
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
    }

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
    const buyWithRemaining = futureBuys.find(b => b.id === t.id);
    if (!buyWithRemaining) {
      throw new Error('There should always be a copy in futureBuys');
    }

    const unmatchedQty = buyWithRemaining.remaining;
    debug('Considering adding to pool. Unmatched quantity: %s', unmatchedQty);

    if (unmatchedQty > 0) {
      debug('Costing: total=%s, quantity=%s, of which unmatched=%s', t.total, t.qty, unmatchedQty);
      const costPortion = (t.total / t.qty) * unmatchedQty;

      poolQty += unmatchedQty;
      poolCost += costPortion;
    }
  }
}

// ===== OUTPUT =====
console.log('Disposals:');
results.forEach(r => {
  console.log(`${r.date} | Sold ${r.qty} BTC | Gain/Loss £${r.gain.toFixed(2)}`);
});

console.log('\nSection 104 Pool:');
console.log(`BTC: ${poolQty}`);
console.log(`Cost: £${poolCost.toFixed(2)}`);
