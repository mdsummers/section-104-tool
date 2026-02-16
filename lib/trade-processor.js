const assert = require('assert');
const debug = require('debug');
const {
  isValidTrade,
} = require('./validation');
const {
  formatDate,
  formatGbp,
} = require('./formatters');
const {
  log,
  logColumns,
  daysBetween,
  COLSIZE,
  LC_30DMATCH,
  LC_S104OPTS,
} = require('./util');
const {
  bigMin,
  isBig,
  ZERO,
} = require('./big-wrapper');

// debug streams
const debugMatching = debug('btc-cgt:matching');
const debugDays = debug('btc-cgt:days');

class TradeProcessor {
  constructor ({ asset, currency }) {
    this.asset = asset;
    this.currency = currency;
  }

  // WIP
  // eslint-disable-next-line class-methods-use-this
  process (trades) {
    let poolQty = ZERO;
    let poolCost = ZERO;

    // POOL MANAGEMENT
    let poolFormed = false;
    function addToPool (qty, cost) {
      assert(isBig(qty), 'addToPool() qty not a Big');
      assert(isBig(cost), 'addToPool() cost not a Big');
      log();
      if (!poolFormed) {
        poolFormed = true;
        poolQty = qty;
        poolCost = cost;
        log('The section 104 holding is formed');
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
          formatGbp(poolCost),
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
        formatGbp(poolCost),
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
        formatGbp(poolCost),
      ], LC_S104OPTS);
      log();
    }

    // TODO
    // eslint-disable-next-line no-unused-vars
    function removeFromPool (qty, cost) {
      throw new Error('Not implemented');
    }

    // ===== MATCHING STRUCTURES =====
    let buyFees = ZERO;
    let sellFees = ZERO;

    const futureBuys = []; // for 30-day matching
    const disposals = [];

    trades.forEach((t) => {
      assert(isValidTrade(t), 'Invalid trade, use DEBUG=* for more info');
      // Pre-store buy for 30-day matching
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
        const disposalProceeds = t.total.abs(); // already net of fee
        let gain = ZERO;

        // ===== 1. SAME-DAY MATCHING =====
        const sameDayBuys = trades.filter((b) => b.type === 'BUY'
          && b.date.toDateString() === t.date.toDateString()
          && b.qty.gt(ZERO));

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
        // eslint-disable-next-line no-restricted-syntax
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
              formatGbp(matchedDisposalProceeds),
            ], LC_30DMATCH);

            const proportionOfMatchedBuy = matchQty.div(b.qty);
            const allowableCost = proportionOfMatchedBuy.times(b.total);
            logColumns([
              'Allowable cost',
              `(apportioned ${matchQty.toFixed(8)} / ${b.qty.toFixed(8)} * ${b.total.toFixed(2)})`,
              '=',
              formatGbp(allowableCost),
            ], LC_30DMATCH);
            const thisGain = matchedDisposalProceeds.minus(allowableCost);
            gain = gain.plus(thisGain);
            logColumns([
              'Total gain',
              '(Disposal proceeds - Allowable cost)',
              '=',
              formatGbp(thisGain),
            ], LC_30DMATCH);

            b.remaining = b.remaining.minus(matchQty);
            remaining = remaining.minus(matchQty);
            debugMatching('buy:%s has %s remaining, we still need to match %s from sale', b.id, b.remaining, remaining);
          }
        } // foreach futureBuys

        // ===== 3. SECTION 104 POOL =====
        if (remaining.gt(ZERO)) {
          throw new Error('Disposal -> section 104 considerations are not tested');
          /*
          const poolCostPerBTC = poolQty.gt(0) ? poolCost.div(poolQty) : ZERO;
          const costPortion = poolCostPerBTC.times(remaining);

          gain = gain.plus(disposalProceeds.div(t.qty).times(remaining)).minus(costPortion);

          poolQty = poolQty.minus(remaining);
          poolCost = poolCost.minus(costPortion);
          remaining = ZERO;
          */
        }

        const shortDate = t.date.toISOString().slice(0, 10);
        disposals.push({
          date: shortDate,
          qty: t.qty,
          proceeds: disposalProceeds,
          gain,
          toString: () => `${shortDate} | Sold ${t.qty} BTC | Gain/Loss ${formatGbp(gain)}`,
        });
      }

      // ===== AFTER PROCESSING, ADD BUYS TO POOL (UNMATCHED ONLY) =====
      if (t.type === 'BUY') {
        buyFees = buyFees.plus(t.fee);
        const buyWithRemaining = futureBuys.find((b) => b.id === t.id);
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
              unmatchedQty.toFixed(8)
            );
          }
          debugMatching('Costing: total=%s, quantity=%s, of which unmatched=%s', t.total, t.qty, unmatchedQty);
          const costPortion = t.total.div(t.qty).times(unmatchedQty);

          addToPool(unmatchedQty, costPortion);
        } else {
          log(unmatchedQty, t.total, t.qty);
          throw new Error('Unhandled condition');
        }
      }
      log(); // line pad post trade
    }

    return {
      disposals,
      gain: disposals.reduce((prev, { gain }) => prev.plus(gain), ZERO),
      pool: {
        qty: poolQty,
        cost: poolCost,
      },
      fees: {
        buy: buyFees,
        sell: sellFees,
        total: buyFees.plus(sellFees),
      },
    };
  }
}

module.exports = TradeProcessor;
