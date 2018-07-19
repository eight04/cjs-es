let _export_foo_;
export {_export_foo_ as foo};
if (foo) {
  _export_foo_ = "foo";
} else {
  _export_foo_ = "bar";
}
