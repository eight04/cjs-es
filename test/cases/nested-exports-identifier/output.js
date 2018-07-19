function test() {
  _export_foo_();
}
const foo = () => "foo";
const _export_foo_ = foo;
export {_export_foo_ as foo};
