const _module_exports_ = () => "foo";
export default _module_exports_;
function test() {
  _module_exports_();
  _module_exports_();
}
