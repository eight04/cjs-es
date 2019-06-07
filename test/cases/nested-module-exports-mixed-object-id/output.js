function test() {
  console.log(_export_foo_);
}

const value = "FOO";

const _export_foo_ = value;
export {_export_foo_ as foo};
