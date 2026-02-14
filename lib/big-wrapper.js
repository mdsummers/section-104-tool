const Big = require('big.js');
const assert = require('assert');

// add safeguard to avoid causing precision loss
Big.strict = true;
Big.DP = 40;
// Default rounding method is Big.roundHalfUp
// Uncomment to switch to rounding up
// Big.RM = Big.roundUp;
const ZERO = new Big('0');

function isBig (given) {
  return given instanceof Big;
}
// Math.min equivalent
function bigMin (a, b) {
  assert(isBig(a), 'bigMin() a not a Big');
  assert(isBig(b), 'bigMin() b not a Big');
  return a.lt(b) ? a : b;
}

module.exports = {
  ZERO,
  Big,
  isBig,
  bigMin,
};
