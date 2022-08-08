let _export_foo_;
export {_export_foo_ as foo};
test();
function test() {
  _export_foo_();
}
_export_foo_ = () => {};
