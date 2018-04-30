const _module_ = {exports: {}};
function test() {
  _module_.exports();
}
_module_.exports = () => {};
export default _module_.exports;
