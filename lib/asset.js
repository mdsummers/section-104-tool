/* eslint-disable class-methods-use-this */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-classes-per-file */
const assert = require('assert');
const {
  isBig,
  bigIsInt,
} = require('./big-wrapper');

class Asset {
  formatAmountWithUnit (given) {
    assert(isBig(given), 'given not a Big');
    return this._withUnit(given);
  }

  formatAmountBare (given) {
    assert(isBig(given), 'given not a Big');
    return this._bare(given);
  }

  _bare () {
    throw new Error('Must be implemented by subclass');
  }

  _withUnit () {
    throw new Error('Must be implemented by subclass');
  }

  header () {
    throw new Error('Must be implemented by subclass');
  }
}

class Bitcoin extends Asset {
  _withUnit (given) {
    return `${this._bare(given)} BTC`;
  }

  _bare (given) {
    return given.toFixed(8);
  }

  header () {
    return 'BTC quantity';
  }
}

class Share extends Asset {
  _withUnit (given) {
    const unit = given.eq('1') ? 'share' : 'shares';
    return `${this._bare(given)} ${unit}`;
  }

  _bare (given) {
    assert(bigIsInt(given), 'Share quantity must be an integer');
    return given.toFixed(0);
  }

  header () {
    return 'Number of shares';
  }
}

class Unit extends Asset {
  _withUnit (given) {
    const unit = given.eq('1') ? 'unit' : 'units';
    return `${this._bare(given)} ${unit}`;
  }

  _bare (given) {
    return given.toFixed(2);
  }

  header () {
    return 'Number of units';
  }
}

module.exports = {
  Asset,
  Bitcoin,
  Share,
  Unit,
};
