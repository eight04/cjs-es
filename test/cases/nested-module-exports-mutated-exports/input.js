function test() {
  [exports] = foo();
}
module.exports = exports = () => "foo";
