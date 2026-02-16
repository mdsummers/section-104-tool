const fs = require('fs');
const InputFormat = require('./lib/input-format');
const TradeProcessor = require('./lib/trade-processor');
const {
  formatGbp,
} = require('./lib/formatters');

// ===== CONFIG =====
const FILE = './without-deposits.csv';

// Reporting in UK, use Europe/London
process.env.TZ = 'Europe/London';

// ===== LOAD CSV =====
const raw = fs.readFileSync(FILE, 'utf8');

// ===== INIT INPUT =====
const input = InputFormat.from(raw);

// ===== NORMALISE TRADES =====
const trades = input.parseTrades();

const tradeProcessor = new TradeProcessor({
  asset: 'BTC',
  currency: 'GBP',
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
console.log('Total gain over timeframe:', formatGbp(gain));

console.log('\nSection 104 Pool:');
console.log('BTC:', pool.qty.toFixed(8));
console.log('Cost:', formatGbp(pool.cost));
console.log('Fees:', formatGbp(fees.total));
console.log('of which buy/sell: %s/%s', formatGbp(fees.buy), formatGbp(fees.sell));
