#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const InputFormat = require('./lib/input-format');
const TradeProcessor = require('./lib/trade-processor');

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
    gains,
    pool,
    fees,
  } = tradeProcessor.process(trades);

  // ===== OUTPUT =====
  console.log('Disposals:');
  disposals.forEach((d) => console.log(d.toString()));
  Object.entries(gains.byTaxYear).forEach(([fy, fyGain]) => {
    console.log('Gains in %s: %s', fy, currency.format(fyGain));
  });
  console.log('Total gain over timeframe:', currency.format(gains.total));

  console.log('\nSection 104 Pool:');
  console.log(
    '%s: %s',
    asset.header(),
    asset.formatAmountBare(pool.qty)
  );
  console.log('Cost:', currency.format(pool.cost));
  console.log('Fees:', currency.format(fees.total));
  console.log(
    'of which buy/sell: %s/%s',
    currency.format(fees.buy),
    currency.format(fees.sell)
  );
});
