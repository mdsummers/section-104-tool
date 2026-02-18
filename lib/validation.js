const debug = require('debug')('btc-cgt:validation');
const {
  ZERO,
  isBig,
} = require('./big-wrapper');

exports.isValidTrade = (given) => {
  const fail = (reason) => {
    debug(`Failed validation with reason: ${reason}`, given);
    return false;
  };
  if (!given) return fail('Falsy given');
  if (typeof given.id !== 'string' || !given.id.length) {
    return fail('given.id not a string of length');
  }
  if (typeof given.description !== 'string' || !given.description.length) {
    return fail('given.description is not a string of length');
  }
  if (!(given.date instanceof Date) || Number.isNaN(given.date.getTime())) {
    return fail('given.date is not a valid date');
  }
  if (!isBig(given.qty) || !given.qty.gt(ZERO)) {
    return fail('given.qty must be a positive Big');
  }
  if (!isBig(given.fee) || !given.fee.gte(ZERO)) {
    return fail('given.fee must be a non-negative Big');
  }
  if (!isBig(given.total) || !given.total.gt(ZERO)) {
    return fail('given.total must be a non-negative Big');
  }
  if (!given.raw) {
    return fail('given.raw must be truthy');
  }
  return true;
};
