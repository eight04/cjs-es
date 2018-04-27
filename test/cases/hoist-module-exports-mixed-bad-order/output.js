let _exports_ = {};
const _module_ = {exports: _exports_};
_module_.exports = _exports_ = () => "foo";
function test() {
  _module_.exports();
  _exports_();
}
export default _module_.exports;
