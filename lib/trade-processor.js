const assert = require('assert');
const debug = require('debug');
const {
  isValidTrade,
} = require('./validation');
const {
  formatDate,
  formatDateOnly,
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
const { Currency } = require('./currency');
const { Asset } = require('./asset');

// debug streams
const debugMatching = debug('s104:matching');
const debugDays = debug('s104:days');

class TradeProcessor {
  constructor ({ asset, currency }) {
    assert(asset instanceof Asset);
    assert(currency instanceof Currency);
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
    const addToPool = (qty, cost) => {
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
          this.asset.header(),
          'Pool of actual cost',
        ], LC_S104OPTS);
        logColumns([
          '',
          '',
          this.asset.formatAmountBare(poolQty),
          this.currency.format(poolCost),
        ], LC_S104OPTS);
        log();

        return;
      }

      logColumns([
        '',
        '',
        this.asset.header(),
        'Pool of actual cost',
      ], LC_S104OPTS);
      logColumns([
        'Brought forward',
        '',
        this.asset.formatAmountBare(poolQty),
        this.currency.format(poolCost),
      ], LC_S104OPTS);
      logColumns([
        '',
        'plus',
        this.asset.formatAmountBare(qty),
        this.currency.format(cost),
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
        this.asset.formatAmountBare(poolQty),
        this.currency.format(poolCost),
      ], LC_S104OPTS);
      log();
    };

    const removeFromPool = (qty, cost) => {
      assert(isBig(qty), 'removeFromPool() qty not a Big');
      assert(isBig(cost), 'removeFromPool() cost not a Big');
      assert(qty.lte(poolQty), `Cannot remove more than exists in the pool. Pool qty ${poolQty}, requested to remove ${qty}`);

      log();
      logColumns([
        '',
        '',
        this.asset.header(),
        'Pool of actual cost',
      ], LC_S104OPTS);
      logColumns([
        'Brought forward',
        '',
        this.asset.formatAmountBare(poolQty),
        this.currency.format(poolCost),
      ], LC_S104OPTS);
      logColumns([
        '',
        'minus',
        this.asset.formatAmountBare(qty),
        this.currency.format(cost),
      ], LC_S104OPTS);
      logColumns([
        '',
        '',
        '-'.repeat(COLSIZE),
        '-'.repeat(COLSIZE),
      ], LC_S104OPTS);
      poolQty = poolQty.minus(qty);
      poolCost = poolCost.minus(cost);
      logColumns([
        'Carried forward',
        '',
        this.asset.formatAmountBare(poolQty),
        this.currency.format(poolCost),
      ], LC_S104OPTS);
      log();
    };

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
      const dateFormatter = t.dateOnly
        ? formatDateOnly
        : formatDate;

      log(`On ${dateFormatter(t.date)} I ${t.description}`);

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
              '%s matched with the buy on %s',
              this.asset.formatAmountWithUnit(matchQty),
              dateFormatter(b.date)
            );

            // disposalProceeds already has fee removed
            const proportionOfFullDisposal = matchQty.div(t.qty);
            const matchedDisposalProceeds = proportionOfFullDisposal.times(disposalProceeds);
            log();
            logColumns([
              'Disposal Proceeds',
              `(apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(t.qty)} * ${disposalProceeds.toFixed(2)})`,
              '=',
              this.currency.format(matchedDisposalProceeds),
            ], LC_30DMATCH);

            const proportionOfMatchedBuy = matchQty.div(b.qty);
            const allowableCost = proportionOfMatchedBuy.times(b.total);
            logColumns([
              'Allowable cost',
              `(apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(b.qty)} * ${b.total.toFixed(2)})`,
              '=',
              this.currency.format(allowableCost),
            ], LC_30DMATCH);
            const thisGain = matchedDisposalProceeds.minus(allowableCost);
            gain = gain.plus(thisGain);
            logColumns([
              'Total gain',
              '(Disposal proceeds - Allowable cost)',
              '=',
              this.currency.format(thisGain),
            ], LC_30DMATCH);

            b.remaining = b.remaining.minus(matchQty);
            remaining = remaining.minus(matchQty);
            debugMatching('buy:%s has %s remaining, we still need to match %s from sale', b.id, b.remaining, remaining);
          }
        } // foreach futureBuys

        // ===== 3. SECTION 104 POOL =====
        if (remaining.gt(ZERO)) {
          const poolCostPerUnit = poolQty.gt(ZERO) ? poolCost.div(poolQty) : ZERO;
          const costPortion = poolCostPerUnit.times(remaining);
          const remainderProportion = remaining.div(t.qty);
          const thisGain = disposalProceeds.div(t.qty).times(remaining).minus(costPortion);

          const poolMatchedProceeds = disposalProceeds.times(remainderProportion);

          gain = gain.plus(thisGain);

          log();
          log(
            '%s of this quantity is matched with the section 104 holding',
            this.asset.formatAmountBare(remaining)
          );
          log();
          logColumns([
            '',
            'Quantity sold',
            '=',
            this.asset.formatAmountWithUnit(remaining),
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          logColumns([
            '',
            '-'.repeat(COLSIZE),
            '',
            '-'.repeat(COLSIZE),
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          logColumns([
            '',
            'Total in holding',
            '',
            this.asset.formatAmountWithUnit(poolQty), // TODO: coupling on pool
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          log();
          logColumns([
            'Cost',
            `${this.currency.format(poolCost)} x ${this.asset.formatAmountBare(remaining)}`,
            '=',
            this.currency.format(costPortion),
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          logColumns([
            '',
            '-'.repeat(COLSIZE),
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          logColumns([
            '',
            this.asset.formatAmountBare(poolQty),
          ], {
            sizes: [0, 0, 3], // short = sign
          });
          log();
          const gainCalcSizes = [30, 15, 15];
          logColumns([
            'Disposal proceeds',
            '',
            this.currency.format(poolMatchedProceeds),
          ], { sizes: gainCalcSizes });
          logColumns([
            'Minus allowable costs',
            /* if fees are later split, swap following two lines */
            '',
            this.currency.format(costPortion),
          ], { sizes: gainCalcSizes });
          /*
            TODO: Evaluate whether this presents an issue.
            What would normally be here would be a line for "Costs"
            to add Fees. Our total is already net of fee.
            logColumns(['Costs', (fee), (allowable + fee)])
          */
          logColumns([
            'Chargeable Gain',
            '',
            this.currency.format(thisGain),
          ], { sizes: gainCalcSizes });
          if (!remaining.eq(t.qty)) {
            // Only required if there was a match
            logColumns([
              'Net Gain',
              '',
              this.currency.format(gain),
            ], { sizes: gainCalcSizes });
          }

          removeFromPool(remaining, costPortion);
          remaining = ZERO;
        }

        const shortDate = t.date.toISOString().slice(0, 10);
        disposals.push({
          date: shortDate,
          qty: t.qty,
          proceeds: disposalProceeds,
          gain,
          toString: () => `${shortDate} | Sold ${this.asset.formatAmountWithUnit(t.qty)} | Gain/Loss ${this.currency.format(gain)}`,
        });
      }

      // ===== AFTER PROCESSING, ADD BUYS TO POOL (UNMATCHED ONLY) =====
      if (t.type === 'BUY') {
        buyFees = buyFees.plus(t.fee);
        const buyWithRemaining = futureBuys.find((b) => b.id === t.id);
        assert(buyWithRemaining, 'There should always be a copy in futureBuys');

        const unmatchedQty = buyWithRemaining.remaining;
        debugMatching('Considering adding to pool. Unmatched quantity: %s', unmatchedQty);
        assert(unmatchedQty.gte(ZERO), 'Negative unmatched quantity');
        // two cases here
        // Full match (remaining === 0)
        // partial match (remaining !== t.qty)
        if (unmatchedQty.eq(ZERO)) {
          log();
          log('Not considered wrt. Section 104 Holding because of previous disposal');
        } else {
          if (!unmatchedQty.eq(t.qty)) {
            // Only a partial match against this BUY
            const previouslyMatched = t.qty.minus(unmatchedQty);
            log();
            log(
              '%s previously matched under 30 day rules, leaving %s for Section 104 consideration',
              this.asset.formatAmountWithUnit(previouslyMatched),
              this.asset.formatAmountWithUnit(unmatchedQty)
            );
          }
          debugMatching('Costing: total=%s, quantity=%s, of which unmatched=%s', t.total, t.qty, unmatchedQty);
          const costPortion = t.total.div(t.qty).times(unmatchedQty);

          addToPool(unmatchedQty, costPortion);
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
