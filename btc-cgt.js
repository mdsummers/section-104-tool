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

// ===== NORMALISE TRADES =====
const trades = input.parseTrades();

const tradeProcessor = new TradeProcessor({
  asset: 'BTC',
  currency: 'GBP'
});

tradeProcessor.process(trades);
