function test() {
  [module.exports] = foo();
}
module.exports = exports = () => "foo";
