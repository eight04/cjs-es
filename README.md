cjs-es
======

Transform CommonJS module into ES module.

Features
--------

* Lightweight.
* Prefer named import/export when possible.
* Only support the syntax that is interchangeable between mjs and js.
* Convert in-place. It only converts:

  - top-level `require` declaration (`const foo = require("foo")`),
  - top-level `module.exports`, `exports` assignment (`module.exports = ...`/`const foo = exports.foo = ...`),
  - dynamic-require expression (`Promise.resolve(require("foo"))`).
  
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
/* code -> `
function foo() {}
function bar() {}
export {foo};
export {bar};
`
```

Import problem
--------------

There are two ways to transform the `require` statement when binding the module into one identifier:

```js
const foo = require("foo");
```

1. Prefer default import, which is the default behavior of the transformer:

    ```js
    import foo from "foo";
    ```
   
2. Prefer named import:

    ```js
    import * as foo from "foo";
    ```
     
    You can switch to this behavior by specifying comment `// all` after `require`:
     
    ```js
    const foo = require("foo"); // all
    ```
    
    The regex of import-all comment:
    
    ```js
    /.+\/\/.+\b(all|import\b.\ball)\b/
    ```

API reference
-------------

This module exports following members.

* `transform`: A function which can convert CJS module synax into ES module syntax.

### transform(options?: object): TransformResult object

`options` has following members:

* `parse`: function. A parser function which can parse JavaScript code into ESTree.
* `code`: string. The JavaScript source code.
* `sourceMap?`: boolean. If true then generate the source map. Default: `false`

The result object has following members:

* `code`: string. The result JavaScript code.
* `map?`: object. The source map object generated by [`magicString.generateMap`](https://github.com/Rich-Harris/magic-string#sgeneratemap-options-).

Changelog
---------

* 0.1.0 (Apr 25, 2018)

  - Initial release.
