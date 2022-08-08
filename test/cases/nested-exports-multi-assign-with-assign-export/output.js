let _export_foo_;
export {_export_foo_ as foo};
_export_foo_ = "foo";
if (foo) {
  _export_foo_ = "bar";
}
