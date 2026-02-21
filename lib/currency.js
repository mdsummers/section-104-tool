const assert = require('assert');
const {
  isBig,
  ZERO,
} = require('./big-wrapper');

class Currency {
  constructor ({
    code,
    symbol,
    fractionDigits = 2,
  }) {
    this.code = code;
    this.symbol = symbol;
    this.fractionDigits = fractionDigits;
  }

  format (given) {
    const addCommas = (withoutCommas) => {
      const [intPart, decPart] = withoutCommas.split('.');
      return [
        new Intl.NumberFormat('en-GB').format(intPart),
        decPart,
      ].join('.');
    };
    assert(isBig(given), 'format() given not a Big');
    const isNegative = given.lt(ZERO);
    return [
      isNegative ? '-' : '',
      this.symbol,
      addCommas(given.abs().toFixed(this.fractionDigits)),
    ].join('');
  }
}

// Instances
const GBP = new Currency({
  code: 'GBP',
  symbol: '£',
  locale: 'en-GB',
});

module.exports = {
  Currency,
  GBP,
};
