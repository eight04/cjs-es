const assert = require("assert");

module.exports = {
  onEnd(result) {
    const props = result._context.importedProperties;
    assert.equal(props.size, 2);
    const names = props.get("foo");
    assert.deepStrictEqual(names, ["test"]);
    const names2 = props.get("bar");
    assert.deepStrictEqual(names2, ["test2"]);
  }
};
