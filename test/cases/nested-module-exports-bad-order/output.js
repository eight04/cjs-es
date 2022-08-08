let _module_exports_ = {};
export {_module_exports_ as default};
test();
_module_exports_ = () => "foo";
function test() {
  _module_exports_();
  _module_exports_();
}
