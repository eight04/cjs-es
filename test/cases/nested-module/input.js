function test() {
  console.log(module.exports);
  module.exports();
}
test();
module.exports = () => {};
