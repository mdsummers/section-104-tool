const assert = require('assert');

class InputFormat {
  static registry = [];

  static register (formatClass) {
    this.registry.push(formatClass);
  }

  static from (input) {
    assert(typeof input === 'string', 'Format.from() input not a string');
    const Ctor = this.registry.find((f) => f.matches(input));
    if (!Ctor) {
      throw new Error('Unknown InputFormat for given input');
    }
    return new Ctor(input);
  }

  parseTrades () {
    throw new Error('Must be implemented by subclass');
  }
}

module.exports = InputFormat;

// register each input format - mild antipattern
InputFormat.register(require('./coinbase'));
