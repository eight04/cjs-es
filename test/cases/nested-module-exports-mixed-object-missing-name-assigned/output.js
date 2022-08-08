let _export_foo_;
export {_export_foo_ as foo};
function test() {
  _export_foo_ = 2;
}

_export_foo_ = () => "FOO";
