cjs-es
======

[![Build Status](https://travis-ci.com/eight04/cjs-es.svg?branch=master)](https://travis-ci.com/eight04/cjs-es)
[![codecov](https://codecov.io/gh/eight04/cjs-es/branch/master/graph/badge.svg)](https://codecov.io/gh/eight04/cjs-es)
[![install size](https://packagephobia.now.sh/badge?p=cjs-es)](https://packagephobia.now.sh/result?p=cjs-es)

Transform CommonJS module into ES module.

Features
--------

* Transform the syntax that is interchangeable between mjs and js e.g. `const foo = require("foo")` -> `import * as foo from "foo";`.
* Hoist the `require`/`exports` statement that is not top-level.
* Transform dynamic imports i.e. `Promise.resolve(require("foo"))` -> `import("foo")`.
* Prefer named import/export when possible.

There are more examples under `test/cases` folder.

Usage
-----

```js
const {parse} = require("acorn");
const {transform} = require("cjs-es");
const code = `
function foo() {}
function bar() {}
module.exports = {foo, bar};
`;
transform({code, parse})
  .then(result => {
    console.log(result.code);
    /* ->
    function foo() {}
    function bar() {}
    export {foo};
    export {bar};
    */
  });
```

Import style
------------

When binding the module into one identifier:

```js
const foo = require("foo");
```

The transformer imports all members from the module by default:

```js
import * as foo from "foo";
```
   
To import the default member, mark `require()` as `// default`:

```js
const foo = require("foo"); // default
```

Result:

```js
import foo from "foo";
```

Note that if the identifier is used as the callee of a function/new expression, it would be considered as the default member since the namespace is not callable.

Export style
------------

If the `module.exports` is assigned with an object pattern:

```js
const foo = "foo";
const bar = "bar";
module.exports = {
  foo,
  bar
};
```

The transformer converts it into named exports:

```js
const foo = "foo";
const bar = "bar";
export {foo};
export {bar};
```
    
To export the entire object as the default member, mark `module.exports` as `// default`:

```js
const foo = "foo";
const bar = "bar";
module.exports = { // default
  foo,
  bar
};
```

Result:

```js
const foo = "foo";
const bar = "bar";
export default {
  foo,
  bar
};
```

Also note that if you set `exportStyle` to `default`, all named exports would be merged into a namespace object:

```js
const foo = "foo";
const bar = "bar";
exports.foo = foo;
exports.bar = bar;
```

Result:

```js
const foo = "foo";
const bar = "bar";
const _module_exports_ = {};
export {_module_exports_ as default};
_module_exports_.foo = foo;
_module_exports_.bar = bar;
```

Hoist
-----

If the `require`/`module`/`exports` statement are nested, they would be hoisted.

#### Require statement

```js
if (foo) {
  require("foo").foo();
}
```

Result:

```js
import * as _require_foo_ from "foo";
if (foo) {
  _require_foo_.foo();
}
```

#### Export statement

```js
if (foo) {
  module.exports = () => "foo";
} else {
  module.exports = () => "bar";
}
```

Result:

```js
let _module_exports_;
export {_module_exports_ as default};
if (foo) {
  _module_exports_ = () => "foo";
} else {
  _module_exports_ = () => "bar";
}
```

#### Named export

```js
if (foo) {
  exports.foo = () => "foo";
}
function test() {
  exports.foo = () => "bar";
}
```

Result:

```js
let _export_foo_;
export {_export_foo_ as foo};
if (foo) {
  _export_foo_ = () => "foo";
}
function test() {
  _export_foo_ = () => "bar";
}
```

Dynamic import
--------------

ES6 lazy load `import("...")` is async and return a promise. It is interchangeable with `Promise.resolve(require("..."))` in CommonJS:

```js
module.exports = () => {
  return Promise.resolve(require("foo"));
};
```

Result:

```js
export default () => {
  return import("foo");
};
```

Use `module.exports`/`exports` at the same time
-----------------------------------------------

It is not a good idea to put `exports` everywhere, but it is a common pattern:

```js
if (foo) {
  exports = module.exports = () => "foo";
} else {
  module.exports = exports = () => "bar";
}
exports.OK = "OK";
console.log(module.exports);
```

All `module.export` and `exports` would be converted into a single reference:

```js
let _module_exports_;
export {_module_exports_ as default};
if (foo) {
  _module_exports_ = () => "foo";
} else {
  _module_exports_ = () => "bar";
}
_module_exports_.OK = "OK";
console.log(_module_exports_);
```

Passing `module` around
-----------------------

It will generate a module wrapper in this case:

```js
var define = require('amdefine')(module);
define(() => {});
```

Result:

```js
const _module_ = {exports: {}};
import _require_amdefine_ from "amdefine";
var define = _require_amdefine_(_module_);
define(() => {});
export default _module_.exports;
```

API reference
-------------

This module exports following members.

* `transform`: A function which can convert CJS module synax into ES module syntax.

### async transform(options?: object): TransformResult object

`options` has following members:

* `parse?`: `function`. A parser function which can parse JavaScript code into ESTree.
* `code`: `string`. The JavaScript source code.
* `ast?`: AST object. If set then ignore `options.parse`.
* `sourceMap?`: `boolean`. If true then generate the source map. Default: `false`
* `importStyle?`: `string` or `function -> string`. The result must be `"named"` or `"default"`. Default: `"named"`

  When the value is a function, it recieves one argument:

  - `moduleId`: `string`. The module ID of `require("module-id")`.

* `exportStyle?`: `string` or `function -> string`. The result must be `"named"` or `"default"`. Default: `"named"`
* `nested?`: `boolean`. If true then analyze the entire AST, otherwise only top-level nodes are visited. If there is no nested require/exports/dynamic import statements, it is safe to keep it off. Default: `false`.
* `warn?`: `function`. This function is called when the transformer emmits a warning. The arguments are:

  - `message`: `string`. Warning message.
  - `pos`: `number`. The position of the current node.
  
  If undefined, the transformer would use global `console.error`.

`options.importStyle` and `options.exportStyle` could be async, and the return value would be cached (for `importStyle`, the value is cached for each `moduleId`).

The result object has following members:

* `code`: string. The result JavaScript code.
* `map?`: object. The source map object generated by [`magicString.generateMap`](https://github.com/Rich-Harris/magic-string#sgeneratemap-options-). If `isTouched` or `options.sourceMap` is false then the map is null.
* `isTouched`: boolean. If false then the code is not changed.

If an error is thrown during walking the AST, the error has a property `pos` which points to the index of the current node.

Changelog
---------

* 0.7.0 (Jun 13, 2019)

  - Add: collect import/exrpot information.
  - Change: export names when module exports object literal and uses nested exports.

* 0.6.4 (Jun 6, 2019)

  - Fix: export default if the object literal has function properties and the function contains `this`.

* 0.6.3 (Jun 6, 2019)

  - Fix: assign a default object if `typeof exports` exists.

* 0.6.2 (Sep 19, 2018)

  - Enhance: try to export live-binding when exporting defaults.
  - Fix: the logic of module wrapper.
  - Fix: mixed exports.
  - Fix: nested module assigned with named exports.

* 0.6.1 (Sep 19, 2018)

  - Bump dependencies.

* 0.6.0 (Sep 19, 2018)

  - Fix: computed properties are detected as named exports.
  - Fix: TypeError when analyzing empty array elements: `[, foo]`.
  - **Breaking: convert `exports` and `module.exports` to a single reference.**

* 0.5.0 (Jul 19, 2018)

  - Add: don't hoist export statements in some cases.

* 0.4.9 (Jun 29, 2018)

  - Fix: failed to transform code without semicolon.

* 0.4.8 (Jun 22, 2018)

  - Add: transform multi-line variable declaration.
  - Fix: super class cannot be a namespace.

* 0.4.7 (May 15, 2018)

  - Fix: default function/class should be converted into an expression.
  - Fix: exporting default IIFE causes syntax error.

* 0.4.6 (May 13, 2018)

  - Fix: use hires map.

* 0.4.5 (May 1, 2018)

  - Fix: arguments of callable require node is ignored.

* 0.4.4 (May 1, 2018)

  - Fix: write export statement after last statement instead of the end of the file.

* 0.4.3 (May 1, 2018)

  - Fix: reassigned import is not a namespace.
  - Add: `options.warn`.
  - Add: warn users for unconverted `require`.
  - Add: support rename for declared named import.
  - Add: support declared export `const foo = module.exports = ...`.

* 0.4.2 (Apr 30, 2018)

  - Fix: template tag is callable.

* 0.4.1 (Apr 30, 2018)

  - Fix: syntax error if exported value is enclosed by parentheses.

* 0.4.0 (Apr 30, 2018)

  - Rewrite for async. `options.importStyle` and `options.exportStyle` are async now.
  - **Change: `transform` function is async now.**
  - **Drop: `options.hoist`, `options.dynamicImport`.**
  - Add: `options.nested`.
  - Fix: namespace is not callable.

* 0.3.3 (Apr 29, 2018)

  - Add: `options.ast`.

* 0.3.2 (Apr 28, 2018)

  - Add: expose `.node` property for tree-walk error.
  - Fix: hoist named export if prefer default + hoist.
  - Fix: hoist named require if prefer default + hoist.
  - Fix: declare.init could be null.

* 0.3.1 (Apr 28, 2018)

  - Fix: error while binding default export to object pattern.

* 0.3.0 (Apr 27, 2018)

  - Merge cjs-hoist.
  - Add: `hoist` option.
  - Add: `dynamicImport` option.

* 0.2.2 (Apr 26, 2018)

  - Add: `isTouched` property.

* 0.2.1 (Apr 26, 2018)

  - Add: transform top-level require call.

* 0.2.0 (Apr 26, 2018)

  - Change: don't suppress parse error.
  - Change: remove `// all` comment.
  - Add: importStyle, exportStyle option.
  - Add: use `// default` to change import/export style.

* 0.1.0 (Apr 25, 2018)

  - Initial release.
