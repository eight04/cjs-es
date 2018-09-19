function test() {
  [_module_exports_] = foo();
}
let _module_exports_ = () => "foo";
export {_module_exports_ as default};
