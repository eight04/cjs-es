const _module_exports_ = () => "foo";
export {_module_exports_ as default};
function test() {
  _module_exports_();
  _module_exports_();
}
