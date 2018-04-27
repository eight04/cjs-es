cjs-es
======

[![Build Status](https://travis-ci.org/eight04/cjs-es.svg?branch=master)](https://travis-ci.org/eight04/cjs-es)

Transform CommonJS module into ES module.

Features
--------

* Prefer named import/export when possible.
* Support the syntax that is interchangeable between mjs and js.
* Convert in-place. By default, it only converts:

  - top-level `require` declaration (`const foo = require("foo")`),
  - top-level `module.exports`, `exports` assignment (`module.exports = ...`/`const foo = exports.foo = ...`),
  
* Hoist the `require`, `exports` statements that is not top-level.
* Transform dynamic imports. (`Promise.resolve(require("foo"))`)

There are more samples under `test/cases` folder.

Usage
-----

```js
const {parse} = require("acorn");
const {transform} = require("cjs-es");
const {code} = transform({
  parse,
  code: `
function foo() {}
function bar() {}
module.exports = {foo, bar};
`
});
/* code == `
function foo() {}
function bar() {}
export {foo};
export {bar};
` */
```

Import style
------------

When binding the module into one identifier:

```js
const foo = require("foo");
```

The transformer imports all members from the module by the default:

```js
import * as foo from "foo";
```
   
To import the default member, add `// default` comment:

```js
const foo = require("foo"); // default
```

Result:

```js
import foo from "foo";
```
    
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
    
If you like to export the entire object as the default member, you can use `// default` comment at the line of `module.exports`:

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

Hoist
-----

If the `require`/`module`/`exports` statement are not at the top level, they would be hoisted:

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

API reference
-------------

This module exports following members.

* `transform`: A function which can convert CJS module synax into ES module syntax.

### transform(options?: object): TransformResult object

`options` has following members:

* `parse`: `function`. A parser function which can parse JavaScript code into ESTree.
* `code`: `string`. The JavaScript source code.
* `sourceMap?`: `boolean`. If true then generate the source map. Default: `false`
* `importStyle?`: `string` or `function -> string`. The result must be `"named"` or `"default"`. Default: `"named"`

  When the value is a function, it recieves one argument:

  - `moduleId`: `string`. The module ID of `require("module-id")`.

* `exportStyle?`: `string` or `function -> string`. The result must be `"named"` or `"default"`. Default: `"named"`
* `hoist?`: `boolean`. If true then turn on hoist transformer. Default: `false`.
* `dynamicImport?`: `boolean`. If true then turn on dynamic import transformer. Default: `false`.

If `hoist` and `dynamicImport` are both `false`, the transformer would only traverse top-level nodes of the AST.

The result object has following members:

* `code`: string. The result JavaScript code.
* `map?`: object. The source map object generated by [`magicString.generateMap`](https://github.com/Rich-Harris/magic-string#sgeneratemap-options-).
* `isTouched`: boolean. If false then the code is not changed.

Changelog
---------

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
