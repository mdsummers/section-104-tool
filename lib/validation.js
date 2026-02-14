const debug = require('debug')('btc-cgt:validation');
const Big = require('big.js');

const ZERO = new Big('0');

const isBig = (given) => (given instanceof Big);
exports.isBig = isBig;

exports.isValidTrade = (given) => {
  const fail = (reason) => {
    debug(`Failed validation with reason: ${reason}`, given);
    return false;
  }
  if (!given) return fail('Falsy given');
  if (typeof given.id !== 'string') {
    return fail('given.id not a string');
  }
  if (typeof given.description !== 'string') {
    return fail('given.description is not a string');
  }
  if (!(given.date instanceof Date) || isNaN(given.date)) {
    return fail('given.date is not a valid date');
  }
  if (!isBig(given.qty) || !given.qty.gt(ZERO)) {
    return fail('given.qty must be a positive Big');
  } 
  if (!isBig(given.fee) || !given.qty.gte(ZERO)) {
    return fail('given.fee must be a non-negative Big');
  } 
  if (!isBig(given.total) || !given.qty.gt(ZERO)) {
    return fail('given.total must be a non-negative Big');
  } 
  if (!given.raw) {
    return fail('given.raw must be truthy');
  } 
  return true;
};
