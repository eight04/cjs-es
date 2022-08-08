test();
function test() {
  exports.foo();
}
exports.foo = () => "foo";
