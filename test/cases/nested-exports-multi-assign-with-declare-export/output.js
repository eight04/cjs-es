let _export_foo_;
export {_export_foo_ as foo};
const foo = _export_foo_ = "foo";
if (bar) {
  _export_foo_ = "bar";
}
