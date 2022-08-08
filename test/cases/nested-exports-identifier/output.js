let _export_foo_;
export {_export_foo_ as foo};
function test() {
  _export_foo_();
}
const foo = () => "foo";
_export_foo_ = foo;
