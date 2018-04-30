const assert = require("assert");
const sinon = require("sinon");
const options = {
  warn: sinon.spy((message, pos) => {
    assert.equal(message, "Unconverted `require`");
    assert.equal(pos, 4);
  }),
  onEnd() {
    assert(this.warn.called);
  }
};
module.exports = options;
