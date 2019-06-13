const {pathToName} = require("./util");

function createImportWriter(context) {
  context.finalImportType = {};
  return {write};
  
  function write() {
    const allImports = new Map;
    for (const node of context.requireNodes) {
      if (node.dynamicImported) {
        writeDynamicImport(node);
        continue;
      }
      if (node.topRequired) {
        writeTopRequire(node);
        continue;
      }
      const requireInfo = node.required || node.declarator.required;
      let nodes = allImports.get(requireInfo.value);
      if (!nodes) {
        nodes = [];
        allImports.set(requireInfo.value, nodes);
      }
      nodes.push(node);
    }
    return Promise.all([...allImports.entries()].map(writeImport));
  }
  
  function writeImport([id, nodes]) {
    return Promise.resolve(
      context.shouldImportDefault.has(id) ||
      nodes.some(n => n.callable || context.hasDefaultComment(n)) ||
      context.isImportPreferDefault(id)
    )
      .then(preferDefault => {
        context.finalImportType[id] = preferDefault ? "default" : "named";
        if (nodes.length === 1 && nodes[0].declarator &&
          (!preferDefault || nodes[0].declarator.isSingleBinding)
        ) {
          return writeDeclaredRequires(nodes[0], preferDefault);
        }
        return writeHoistRequires(id, nodes, preferDefault);
      });
  }
  
  function writeDeclaredRequires(node, preferDefault) {
    if (node.declarator.isSingleBinding) {
      // const foo = require("foo")
      if (preferDefault) {
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
    } else {
      // prev is other stuff
      context.s.overwrite(
        node.declarator.prev.end,
        node.declarator.node.start,
        ";\n",
        {contentOnly: true}
      );
    }
    if (node.declarator.next && !node.declarator.next.declarator) {
      // next is not declarator
      context.s.overwrite(
        node.declarator.required.end,
        node.declarator.next.start,
        `;\n${node.declarator.declaration.kind} `
      );
    } else {
      // remove right parenthesis
      context.s.remove(node.declarator.required.end, node.declarator.right.end);
    }
  }
  
  function writeHoistRequires(id, requires, preferDefault) {
    // find top-most require
    let topNode = requires[0];
    for (let i = 1; i < requires.length; i++) {
      if (topNode.start > requires[i].start) {
        topNode = requires[i];
      }
    }
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
      if (node.declarator && node.declarator.prev && node.declarator.prev.declarator) {
        context.s.overwrite(
          node.declarator.prev.end,
          node.declarator.node.start,
          `;\n${node.declarator.declaration.kind} `,
          {contentOnly: true}
        );
      }
    }
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
