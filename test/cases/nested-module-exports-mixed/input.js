exports = module.exports = () => "foo";
function test() {
  exports();
  exports.version = 123;
  module.exports.ok = 456;
  console.log(exports.foo);
}
