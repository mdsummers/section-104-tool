const Big = require('big.js');
const assert = require('assert');
const util = require('util');

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

function bigIsInt (a) {
  assert(isBig(a), 'bigIsInt() a not a Big');
  return a.round().eq(a);
}

/**
 * Patches Big prototype so util.inspect() prints Big values
 * as a fixed decimal string instead of an object.
 *
 * @param {Object} [options]
 * @param {number} [options.dp]  Decimal places for toFixed()
 */
function enableBigInspect () {
  // Avoid patching multiple times
  if (Big.prototype[util.inspect.custom]) return;

  // we need access to this
  // eslint-disable-next-line func-names
  Big.prototype[util.inspect.custom] = function () {
    return this.toString();
  };
}

function disableBigInspect () {
  delete Big.prototype[util.inspect.custom];
}

module.exports = {
  ZERO,
  Big,
  isBig,
  bigMin,
  bigIsInt,
  enableBigInspect,
  disableBigInspect,
};
