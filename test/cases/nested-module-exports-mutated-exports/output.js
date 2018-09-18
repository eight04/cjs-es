function test() {
  [_module_exports_] = foo();
}
let _module_exports_ = () => "foo";
export default _module_exports_;
