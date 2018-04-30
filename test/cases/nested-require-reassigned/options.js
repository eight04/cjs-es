const assert = require("assert");
const sinon = require("sinon");
const options = {
  warn: sinon.spy((message, pos) => {
    assert.equal(message, "`require` is used as a variable");
    assert.equal(pos, 4);
  }),
  onEnd() {
    assert(this.warn.called);
  }
};
module.exports = options;
