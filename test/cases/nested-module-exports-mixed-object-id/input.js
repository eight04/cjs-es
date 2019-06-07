function test() {
  console.log(module.exports.foo);
}

const value = "FOO";

module.exports = {
  foo: value
};
