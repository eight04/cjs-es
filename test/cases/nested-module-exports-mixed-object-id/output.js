let _export_foo_;
export {_export_foo_ as foo};
function test() {
  console.log(_export_foo_);
}

const value = "FOO";

_export_foo_ = value;
