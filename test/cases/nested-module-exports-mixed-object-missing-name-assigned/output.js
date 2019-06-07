function test() {
  _export_foo_ = 2;
}

let _export_foo_ = () => "FOO";
export {_export_foo_ as foo};
