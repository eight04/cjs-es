function test() {
  console.log(module.exports.bar);
}

module.exports = {
  foo: () => "FOO"
};
