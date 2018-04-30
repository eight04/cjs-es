const {pathToName} = require("./util");

function createImportWriter(context) {
  context.hoistRequires = new Map;
  return {write};
  
  function write() {
    return Promise.all(context.requireNodes.map(node => {
      if (node.declared) {
        return writeDeclare(node);
      }
      if (node.dynamicImported) {
        return writeDynamicImport(node);
      }
      if (node.topRequired) {
        return writeTopRequire(node);
      }
      // node.required
      return writeRequire(node);
    }))
      .then(writeHoistRequires); // hoist requires has to be sorted before writing.
  }
  
  function writeDeclare(node) {
    return Promise.resolve(
      node.declared.isSingleBinding && context.callableIds.has(node.declared.left.name) ||
      context.hasDefaultComment(node) ||
      context.isImportPreferDefault(node.declared.required.value)
    )
      .then(preferDefault => {
        if (node.declared.isSingleBinding) {
          // const foo = require("foo")
          if (preferDefault) {
            // import default
            context.s.overwrite(
              node.declared.node.start,
              node.declared.left.start,
              "import "
            );
          } else {
            // import named
            context.s.overwrite(
              node.declared.node.start,
              node.declared.left.start,
              "import * as "
            );
          }
        } else {
          if (preferDefault) {
            node.required = node.declared.required;
            return writeRequire(node);
          }
          if (node.declared.property) {
            // const foo = require("foo").foo;
            context.s.overwrite(
              node.declared.node.start,
              node.declared.left.start,
              `import {${node.declared.property.name !== node.declared.left.name ? `${node.declared.property.name} as ` : ""}`
            );
            context.s.appendLeft(node.declared.left.end, "}");
          } else {
            // const {foo, bar}
            context.s.overwrite(
              node.declared.node.start,
              node.declared.object.start,
              "import "
            );
            // foo: bar
            for (const prop of node.declared.object.properties) {
              if (prop.key.end < prop.value.start) {
                context.s.overwrite(
                  prop.key.end,
                  prop.value.start,
                  " as "
                );
              }
            }
          }
        }
        context.s.overwrite(
          node.declared.left.end,
          node.declared.required.start,
          " from "
        );
        context.s.remove(node.declared.required.end, node.declared.right.end);
      });
  }
  
  function writeRequire(node) {
    // put them into a id->node map
    let arr = context.hoistRequires.get(node.required.value);
    if (!arr) {
      arr = [];
      context.hoistRequires.set(node.required.value, arr);
    }
    arr.push(node);
  }
  
  function writeHoistRequires() {
    return Promise.all([...context.hoistRequires.entries()].map(([id, requires]) => {
      // find top-most require
      let topNode = requires[0];
      for (let i = 1; i < requires.length; i++) {
        if (topNode.start > requires[i].start) {
          topNode = requires[i];
        }
      }
      return Promise.resolve(
        requires.some(r => r.required.callable) ||
        context.hasDefaultComment(topNode) ||
        context.isImportPreferDefault(id)
        // initialize the promise here to benefit from `.callable` and `hasDefaultComment` short circut.
      )
        .then(preferDefault => {
          const name = `_require_${pathToName(id)}_`;
          context.s.appendLeft(
            topNode.rootPos,
            `import ${preferDefault ? "" : "* as "}${name} from ${JSON.stringify(id)};\n`
          );
          for (const node of requires) {
            context.s.overwrite(
              node.start,
              node.end,
              name,
              {contentOnly: true}
            );
          }
        });
    }));
  }
  
  function writeDynamicImport(node) {
    context.s.overwrite(node.dynamicImported.start, node.callee.end, "import");
    context.s.remove(node.end, node.dynamicImported.end);
  }
  
  function writeTopRequire(node) {
    context.s.overwrite(node.start, node.topRequired.start, "import ");
    context.s.remove(node.topRequired.end, node.end);
  }
}

module.exports = {createImportWriter};
