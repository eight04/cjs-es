cjs-es
======

Transform commonjs module into es module.

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

Concept
-------

* Lite.
* Prefer named import/export when possible.
* Only support syntax which is interchangeable between mjs and js.
* Convert in-place i.e. it only converts top-level `require`, `exports` assignment, and dynamic-require expression (`Promise.resolve(require("foo"))`).

Import problem
--------------

There are two ways to transform the `require` statement:

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
     
    by specifying comment `// all` after `require`:
     
    ```js
    const foo = require("foo"); // all
    ```
