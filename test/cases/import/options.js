const assert = require("assert");

module.exports = {
  onEnd(result) {
    assert.deepStrictEqual(result.context.finalImportType, {foo: "named"});
  }
};
