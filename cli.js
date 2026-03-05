#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const InputFormat = require('./lib/input-format');
const TradeProcessor = require('./lib/trade-processor');

const {
  ZERO,
} = require('./lib/big-wrapper');

const { logColumns } = require('./lib/util');

const [, cmd, file] = process.argv;
const usage = `Usage: ${cmd} <file>`;

if (file === '-h') {
  console.log(usage);
  process.exit(0);
}

if (!file) {
  console.error(usage);
  process.exit(1);
}

const filePath = path.resolve(file);
if (!fs.existsSync(filePath)) {
  console.error('Error: file not found:', filePath);
  console.error(usage);
  process.exit(1);
}

// Reporting in UK, use Europe/London
process.env.TZ = 'Europe/London';

// ===== LOAD CSV =====
const raw = fs.readFileSync(filePath, 'utf8');

// ===== INIT INPUT =====
const input = InputFormat.from(raw);

const assetTrades = input.extractAssetTrades();
assetTrades.forEach(({
  trades,
  asset,
  currency,
}, i) => {
  if (i) console.log(); // add a blank line
  if (assetTrades.length > 1) {
    console.log('===== POOL: %s =====', asset.toString());
  }
  const tradeProcessor = new TradeProcessor({
    asset,
    currency,
  });

  const {
    disposals,
    gain,
    pool,
    fees,
    taxYears,
  } = tradeProcessor.process(trades);

  // ===== OUTPUT =====
  console.log('Disposals:');
  disposals.forEach((d) => console.log(d.toString()));

  const colSizes = [10, 16];
  if (disposals.length) {
    console.log('');
    logColumns([
      'Tax Year',
      'No. of disposals',
      'Disposal proceeds',
      'Allowable costs',
      'Gains in year',
    ], { sizes: colSizes });
  }
  Object.entries(taxYears).forEach(([fy, {
    numberOfDisposals,
    allowableCosts,
    disposalProceeds,
    gainsInYear,
  }]) => {
    logColumns([
      fy,
      `${numberOfDisposals}       `,
      currency.format(disposalProceeds),
      currency.format(allowableCosts),
      currency.format(gainsInYear),
    ], { sizes: colSizes });
  });
  console.log('Total gain over timeframe:', currency.format(gain));

  console.log('\nSection 104 Pool:');
  const poolInfo = [
    `${asset.header()}: ${asset.formatAmountBare(pool.qty)}`,
    `Cost: ${currency.format(pool.cost)}`,
  ];
  if (pool.qty.gt(ZERO) && pool.cost.gt(ZERO)) {
    poolInfo.push(`Avg: ${currency.format(pool.cost.div(pool.qty))}`);
  }
  console.log(poolInfo.join(' | '));
  console.log(
    'Fees: %s (buy %s, sell %s)',
    currency.format(fees.total),
    currency.format(fees.buy),
    currency.format(fees.sell)
  );
});
