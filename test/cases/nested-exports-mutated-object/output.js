let _export_foo_ = 0;
export {_export_foo_ as foo};
({
  foo: {
    bar: _export_foo_
  }
} = foo);
