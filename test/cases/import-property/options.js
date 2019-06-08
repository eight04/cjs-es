const assert = require("assert");

module.exports = {
  onEnd(result) {
    const names = result.context.importedProperties.get("foo");
    assert.deepStrictEqual(names, ["foo"]);
  }
}