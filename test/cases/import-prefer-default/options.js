const assert = require("assert");

module.exports = {
  "importStyle": "default",
  onEnd(result) {
    assert.deepStrictEqual(result.context.finalImportType, {foo: "default"});
  }
};
