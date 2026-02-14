const assert = require('assert');
const {
  isBig,
} = require('./validation');

function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function log (...args) {
  // allow us to wrap this later
  console.log(...args);
}

const COLSIZE = 20;
const LC_S104OPTS = { sizes: [0, 10] };
const LC_30DMATCH = { sizes: [0, 50, 1, 10] };
function logColumns (cols, {
  sizes = new Array(cols.length).fill(COLSIZE),
} = {}) {
  log(cols.map((c, i) => c.padStart(sizes[i] || COLSIZE, ' ')).join(' '));
}

module.exports = {
  log,
  logColumns,
  daysBetween,
  COLSIZE,
  LC_30DMATCH,
  LC_S104OPTS,
};
