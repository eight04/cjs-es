exports.foo = 0;
({
  foo: {
    bar: exports.foo
  }
} = foo);
