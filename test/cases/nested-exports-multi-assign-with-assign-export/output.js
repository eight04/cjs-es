let _export_foo_ = "foo";
export {_export_foo_ as foo};
if (foo) {
  _export_foo_ = "bar";
}
