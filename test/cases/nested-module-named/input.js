test();
function test() {
  module.exports.foo();
}
module.exports.foo = () => {};
