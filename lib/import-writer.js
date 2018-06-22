const {pathToName} = require("./util");

function createImportWriter(context) {
  context.hoistRequires = new Map;
  context.declaredRequires = [];
  return {write};
  
  function write() {
    return Promise.all(context.requireNodes.map(node => {
      if (node.declarator) {
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
      .then(() => 
        Promise.all([
          writeDeclaredRequires(),
          writeHoistRequires() // hoist requires has to be sorted before writing.
        ])
      );
  }
  
  function writeDeclare(node) {
    return Promise.resolve(
      node.declarator.isSingleBinding && context.nonNamespaceIds.has(node.declarator.left.name) ||
      context.hasDefaultComment(node) ||
      context.isImportPreferDefault(node.declarator.required.value)
    )
      .then(preferDefault => {
        node.preferDefault = preferDefault;
        if (!node.declarator.isSingleBinding && preferDefault) {
          node.required = node.declarator.required;
          node.declarator.node.declarator = null;
          return writeRequire(node);
        }
        context.declaredRequires.push(node);
      });
  }
  
  function writeDeclaredRequires() {
    for (const node of context.declaredRequires) {
      if (node.declarator.isSingleBinding) {
        // const foo = require("foo")
        if (node.preferDefault) {
          // import default
          context.s.appendRight(
            node.declarator.left.start,
            "import "
          );
        } else {
          // import named
          context.s.appendRight(
            node.declarator.left.start,
            "import * as "
          );
        }
      } else if (node.declarator.property) {
        // const foo = require("foo").foo;
        context.s.appendRight(
          node.declarator.left.start,
          `import {${node.declarator.property.name !== node.declarator.left.name ? `${node.declarator.property.name} as ` : ""}`
        );
        context.s.appendLeft(node.declarator.left.end, "}");
      } else {
        // const {foo, bar}
        context.s.appendRight(
          node.declarator.object.start,
          "import "
        );
        // foo: bar
        for (const prop of node.declarator.object.properties) {
          if (prop.key.end < prop.value.start) {
            context.s.overwrite(
              prop.key.end,
              prop.value.start,
              " as "
            );
          }
        }
      }
      context.s.overwrite(
        node.declarator.left.end,
        node.declarator.required.start,
        " from "
      );
      if (!node.declarator.prev) {
        // first declarator
        context.s.remove(node.declarator.declaration.start, node.declarator.node.start);
      } else if (node.declarator.prev.declarator) {
        // prev is declarator
        // pass
      } else {
        // prev is other stuff
        context.s.overwrite(
          node.declarator.prev.end,
          node.declarator.node.start,
          ";\n"
        );
      }
      if (!node.declarator.next) {
        // last declarator
        context.s.remove(node.declarator.required.end, node.declarator.right.end);
      } else if (node.declarator.next.declarator) {
        // next is declarator
        context.s.overwrite(
          node.declarator.required.end,
          node.declarator.next.declarator.left.start,
          ";\n"
        );
      } else {
        context.s.overwrite(
          node.declarator.required.end,
          node.declarator.next.start,
          `;\n${node.declarator.declaration.kind} `
        );
      }
    }
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
        requires.some(n => n.callable || n.preferDefault) ||
        context.hasDefaultComment(topNode) ||
        context.isImportPreferDefault(id)
        // initialize the promise here to benefit from `.callable` and `hasDefaultComment` short circuit.
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
