let _module_exports_ = {};
export {_module_exports_ as default};
_module_exports_ = () => "foo";
function test() {
  _module_exports_();
  _module_exports_.version = 123;
  _module_exports_.ok = 456;
  console.log(_module_exports_.foo);
}
