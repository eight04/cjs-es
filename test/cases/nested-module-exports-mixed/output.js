const _module_exports_ = () => "foo";
export {_module_exports_ as default};
function test() {
  _module_exports_();
  _module_exports_.version = 123;
  _module_exports_.ok = 456;
  console.log(_module_exports_.foo);
}
