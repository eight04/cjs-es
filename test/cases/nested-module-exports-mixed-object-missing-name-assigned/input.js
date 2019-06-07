function test() {
  module.exports.foo = 2;
}

module.exports = {
  foo: () => "FOO"
};
