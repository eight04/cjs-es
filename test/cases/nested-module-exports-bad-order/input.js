module.exports = exports = () => "foo";
function test() {
  module.exports();
  exports();
}
