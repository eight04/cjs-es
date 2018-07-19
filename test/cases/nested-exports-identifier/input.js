function test() {
  exports.foo();
}
const foo = () => "foo";
exports.foo = foo;
