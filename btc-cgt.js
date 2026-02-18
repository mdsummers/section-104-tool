const fs = require('fs');
const InputFormat = require('./lib/input-format');
const TradeProcessor = require('./lib/trade-processor');

// ===== CONFIG =====
const FILE = './without-deposits.csv';

// Reporting in UK, use Europe/London
process.env.TZ = 'Europe/London';

// ===== LOAD CSV =====
const raw = fs.readFileSync(FILE, 'utf8');

// ===== INIT INPUT =====
const input = InputFormat.from(raw);
const {
  asset,
  currency,
} = input;

// ===== NORMALISE TRADES =====
const trades = input.parseTrades();

const tradeProcessor = new TradeProcessor({
  asset,
  currency,
});

const {
  disposals,
  gain,
  pool,
  fees,
} = tradeProcessor.process(trades);

// ===== OUTPUT =====
console.log('Disposals:');
disposals.forEach((d) => console.log(d.toString()));
console.log('Total gain over timeframe:', currency.format(gain));

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
