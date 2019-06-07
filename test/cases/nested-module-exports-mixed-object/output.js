function test() {
  _export_foo_();
}

const _export_foo_ = () => "FOO";
export {_export_foo_ as foo};
