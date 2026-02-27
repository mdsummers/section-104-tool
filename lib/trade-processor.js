const assert = require('assert');
const debug = require('debug');
const { format } = require('util');
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
  getUkTaxYear,
  getShortDate,
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
const debugPool = debug('s104:pool');

class TradeProcessor {
  constructor ({ asset, currency }) {
    assert(asset instanceof Asset);
    assert(currency instanceof Currency);
    this.asset = asset;
    this.currency = currency;
  }

  // WIP
  // eslint-disable-next-line class-methods-use-this
  process (givenTrades) {
    let poolQty = ZERO;
    let poolCost = ZERO;

    // POOL MANAGEMENT
    let poolFormed = false;
    const poolDebug = () => debugPool(
      'qty=%s cost=%s avg=%s',
      this.asset.formatAmountWithUnit(poolQty),
      this.currency.format(poolCost),
      poolQty.gt(ZERO)
        ? this.currency.format(poolCost.div(poolQty))
        : 'N/A'
    );
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
        poolDebug();
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
      poolDebug();
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
      poolDebug();
    };

    // ===== MATCHING STRUCTURES =====
    let buyFees = ZERO;
    let sellFees = ZERO;

    const futureBuys = []; // for 30-day matching
    const disposals = [];

    // init trades
    // validation, sanitization, etc.
    const sanitizedTrades = givenTrades.map((t) => {
      assert(isValidTrade(t), 'Invalid trade, use DEBUG=* for more info');
      const absTotal = t.total.abs();
      if (!absTotal.eq(t.total)) {
        debugMatching(
          'Corrected negative total. Was %s, now %s',
          this.currency.format(t.total),
          this.currency.format(absTotal)
        );
      }

      // normalize net fees so that:
      // For Sell, total = disposal proceeds
      // For Buy, total = asset cost before fees
      const {
        totalNetFee = true, // default to true
      } = t;
      let realTotal;
      if (totalNetFee) {
        realTotal = t.type === 'BUY'
          ? absTotal.minus(t.fee) // remove the fee
          : absTotal.plus(t.fee); // add back the fee
        debugMatching(
          'Correcting total net of fees. Type: %s. Fee: %s. Total was: %s. Real total: %s',
          t.type,
          t.fee,
          this.currency.format(absTotal),
          this.currency.format(realTotal)
        );
      } else {
        realTotal = absTotal;
      }

      const sanitizedTrade = {
        ...t,
        total: realTotal,
      };

      return sanitizedTrade;
    });

    const consolidateDailyTrades = (_trades) => {
      const consolidate = (thisTrade, existing) => {
        if (!existing) return thisTrade;
        const isBuy = thisTrade.type === 'BUY';
        const descriptionPhrasing = isBuy ? 'acquisitions' : 'disposals';
        const consolidatedCount = existing.consolidatedCount
          ? existing.consolidatedCount
          : 2;
        const qty = existing.qty.plus(thisTrade.qty);
        const total = existing.total.plus(thisTrade.total);
        const fee = existing.fee.plus(thisTrade.fee);
        const description = format(
          'made %s %s of %s totalling %s for %s%s',
          consolidatedCount,
          descriptionPhrasing,
          this.asset.toString(),
          this.asset.formatAmountWithUnit(qty),
          this.currency.format(total),
          fee.gt(ZERO)
            ? ` with fees of ${this.currency.format(fee)}`
            : ''
        );
        return {
          ...existing,
          id: [existing.id, thisTrade.id].join(','),
          description,
          dateOnly: true, // lose time precision if any
          qty,
          total,
          fee,
          consolidatedCount,
          raw: consolidatedCount > 2 // was already consolidated?
            ? existing.raw.concat(thisTrade.raw) // add to existing array
            : [existing.raw].concat(thisTrade.raw), // make new array
        };
      };
      const consolidatedByMap = new Map();
      _trades.forEach((t) => {
        // utilize lexicographic sort, sell before buy
        // e.g. 2021-01-01-a sorts before 2021-01-01-b
        const dateKey = [
          getShortDate(t.date),
          t.type === 'SELL' ? 'a' : 'b',
        ].join('');
        consolidatedByMap.set(dateKey, consolidate(
          t,
          consolidatedByMap.get(dateKey)
        ));
      });

      debugMatching('Consolidation input %d trade(s)', _trades.length);
      debugMatching('Consolidation output %d trade(s)', consolidatedByMap.size);
      return Array.from(consolidatedByMap.keys())
        .sort() // lexicographic
        .map((key) => consolidatedByMap.get(key));
    };
    const trades = consolidateDailyTrades(sanitizedTrades);
    trades.forEach((t) => {
      // Add "remaining" for all buys to help with matching
      if (t.type === 'BUY') {
        futureBuys.push({
          ...t,
          remaining: t.qty,
        });
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
        const disposalProceeds = t.total.abs();
        let gain = ZERO;
        let allowableCost = ZERO;

        // ===== 1. SAME-DAY MATCHING =====
        // TODO: These aren't really future buys anymore, they're just buys
        const sameDayBuys = futureBuys.filter((b) => b.type === 'BUY'
          && b.date.toDateString() === t.date.toDateString()
          && b.qty.gt(ZERO));

        debugMatching('There are %d same day buys for sell %s', sameDayBuys.length, t.id);
        // eslint-disable-next-line no-restricted-syntax
        for (const b of sameDayBuys) {
          if (remaining.lte(ZERO)) break;

          // some buys could presumably have been previous matches against early sells
          // by 30-day matching rule, so we must use b.remaining here
          const matchQty = bigMin(remaining, b.remaining);
          debugMatching('matched %s from buy:%s (within 30 days)', matchQty, b.id);
          log();
          log(
            '%s matched with same-day acquisitions',
            this.asset.formatAmountWithUnit(matchQty)
          );
          const proportionOfFullDisposal = matchQty.div(t.qty);
          const matchedDisposalProceeds = proportionOfFullDisposal.times(disposalProceeds);
          const matchedDisposalFee = proportionOfFullDisposal.times(t.fee);
          const apportionDisposalStr = `apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(t.qty)}`;
          const apportionAcquisitionStr = `apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(b.qty)}`;
          log();
          logColumns([
            'Disposal Proceeds',
            `(${apportionDisposalStr} * ${disposalProceeds.toFixed(2)})`,
            '=',
            this.currency.format(matchedDisposalProceeds),
          ], LC_30DMATCH);
          logColumns([
            'Disposal Fees',
            `(${apportionDisposalStr} * ${t.fee.toFixed(2)})`,
            '=',
            this.currency.format(matchedDisposalFee),
          ], LC_30DMATCH);

          const proportionOfMatchedBuy = matchQty.div(b.qty);
          // (buyTotal / buy quantity) = unit cost of the acquisition
          const matchedAcquisitionCost = proportionOfMatchedBuy.times(b.total);
          const matchedAcquisitionFee = proportionOfMatchedBuy.times(b.fee);

          const thisAllowedCost = matchedDisposalFee
            .plus(matchedAcquisitionCost)
            .plus(matchedAcquisitionFee);
          logColumns([
            'Acquisition costs',
            `(${apportionAcquisitionStr} * ${b.total.toFixed(2)})`,
            '=',
            this.currency.format(matchedAcquisitionCost),
          ], LC_30DMATCH);
          logColumns([
            'Acquisition Fees',
            `(${apportionAcquisitionStr} * ${b.fee.toFixed(2)})`,
            '=',
            this.currency.format(matchedAcquisitionFee),
          ], LC_30DMATCH);
          logColumns([
            'Allowable cost',
            '(Disposal fees + Acq. costs + Acq. fees)',
            '=',
            this.currency.format(thisAllowedCost),
          ], LC_30DMATCH);
          const thisGain = matchedDisposalProceeds.minus(thisAllowedCost);

          gain = gain.plus(thisGain);
          allowableCost = allowableCost.plus(thisAllowedCost);
          logColumns([
            'Total gain',
            '(Disposal proceeds - Allowable cost)',
            '=',
            this.currency.format(thisGain),
          ], LC_30DMATCH);

          b.remaining = b.remaining.minus(matchQty);
          remaining = remaining.minus(matchQty);
          debugMatching(
            'buy:%s has %s remaining, we still need to match %s from sale',
            b.id,
            b.remaining,
            remaining
          );
        }

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

            // disposalProceeds is before fee considered
            const proportionOfFullDisposal = matchQty.div(t.qty);
            const matchedDisposalProceeds = proportionOfFullDisposal.times(disposalProceeds);
            // get same proportion of any disposal fee
            const matchedDisposalFee = proportionOfFullDisposal.times(t.fee);
            const apportionDisposalStr = `apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(t.qty)}`;
            const apportionAcquisitionStr = `apportioned ${this.asset.formatAmountBare(matchQty)} / ${this.asset.formatAmountBare(b.qty)}`;
            log();
            logColumns([
              'Disposal Proceeds',
              `(${apportionDisposalStr} * ${disposalProceeds.toFixed(2)})`,
              '=',
              this.currency.format(matchedDisposalProceeds),
            ], LC_30DMATCH);
            logColumns([
              'Disposal Fees',
              `(${apportionDisposalStr} * ${t.fee.toFixed(2)})`,
              '=',
              this.currency.format(matchedDisposalFee),
            ], LC_30DMATCH);
            const proportionOfMatchedBuy = matchQty.div(b.qty);
            const matchedAcquisitionCost = proportionOfMatchedBuy.times(b.total);
            const matchedAcquisitionFee = proportionOfMatchedBuy.times(b.fee);
            const thisAllowedCost = matchedDisposalFee
              .plus(matchedAcquisitionCost)
              .plus(matchedAcquisitionFee);
            logColumns([
              'Acquisition costs',
              `(${apportionAcquisitionStr} * ${b.total.toFixed(2)})`,
              '=',
              this.currency.format(matchedAcquisitionCost),
            ], LC_30DMATCH);
            logColumns([
              'Acquisition Fees',
              `(${apportionAcquisitionStr} * ${b.fee.toFixed(2)})`,
              '=',
              this.currency.format(matchedAcquisitionFee),
            ], LC_30DMATCH);
            logColumns([
              'Allowable cost',
              '(Disposal fees + Acq. costs + Acq. fees)',
              '=',
              this.currency.format(thisAllowedCost),
            ], LC_30DMATCH);
            const thisGain = matchedDisposalProceeds.minus(thisAllowedCost);
            gain = gain.plus(thisGain);
            allowableCost = allowableCost.plus(thisAllowedCost);
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

          const poolMatchedProceeds = disposalProceeds.times(remainderProportion);
          const remainderDisposalFee = t.fee.times(remainderProportion);

          const thisAllowableCost = remainderDisposalFee.plus(costPortion);
          const thisGain = poolMatchedProceeds.minus(thisAllowableCost);

          // update totals for this disposal
          gain = gain.plus(thisGain);
          allowableCost = allowableCost.plus(thisAllowableCost);

          log();
          log(
            '%s matched with the section 104 holding',
            this.asset.formatAmountWithUnit(remaining)
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
            this.currency.format(costPortion),
            '',
          ], { sizes: gainCalcSizes });
          logColumns([
            !t.fee.eq(remainderDisposalFee) ? 'Costs (apportioned)' : 'Costs',
            this.currency.format(remainderDisposalFee),
            this.currency.format(thisAllowableCost),
          ], { sizes: gainCalcSizes });
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

        const taxYear = getUkTaxYear(t.date);
        const shortDate = getShortDate(t.date);
        disposals.push({
          date: shortDate,
          taxYear,
          qty: t.qty,
          proceeds: disposalProceeds, // qty * cost per unit
          allowableCost, // disposal fee + acquisition costs
          gain, // proceeds - allowableCost
          toString: () => `${shortDate} | ${taxYear} | Sold ${this.asset.formatAmountWithUnit(t.qty)} | Gain/Loss ${this.currency.format(gain)}`,
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
          const unmatchedProportion = unmatchedQty.div(t.qty);
          const costPortion = t.total.times(unmatchedProportion);
          const feePortion = t.fee.times(unmatchedProportion);
          debugMatching(
            'Cost portion=%s, fee portion=%s',
            costPortion.toFixed(2),
            feePortion.toFixed(2)
          );

          addToPool(unmatchedQty, costPortion.plus(feePortion));
        }
      }
      log(); // line pad post trade
    }

    const {
      totalGain,
      taxYears,
    } = (() => {
      // no-shadow doesn't deal with IIFE well
      // eslint-disable-next-line no-shadow
      let totalGain = ZERO;
      // eslint-disable-next-line no-shadow
      const taxYears = new Map();
      const getTaxYear = (fy) => {
        if (!taxYears.has(fy)) {
          taxYears.set(fy, {
            numberOfDisposals: 0,
            disposalProceeds: ZERO,
            allowableCosts: ZERO,
            gainsInYear: ZERO,
          });
        }
        return taxYears.get(fy);
      };
      disposals.forEach((d) => {
        totalGain = totalGain.plus(d.gain);
        const thisTaxYear = getTaxYear(d.taxYear);
        thisTaxYear.numberOfDisposals++;
        thisTaxYear.disposalProceeds = thisTaxYear.disposalProceeds.plus(d.proceeds);
        thisTaxYear.allowableCosts = thisTaxYear.allowableCosts.plus(d.allowableCost);
        thisTaxYear.gainsInYear = thisTaxYear.gainsInYear.plus(d.gain);
      });

      return {
        totalGain,
        taxYears: Object.fromEntries(taxYears),
      };
    })();

    return {
      disposals,
      gain: totalGain,
      pool: {
        qty: poolQty,
        cost: poolCost,
      },
      fees: {
        buy: buyFees,
        sell: sellFees,
        total: buyFees.plus(sellFees),
      },
      taxYears,
    };
  }
}

module.exports = TradeProcessor;
