function createExportWriter(context) {
  context.defaultExports = [];
  context.namedExports = new Map;
  return {write};
  
  function write() {
    if (!context.moduleNodes.length && !context.exportsNodes.length) {
      return;
    }
    // passing module around
    if (context.moduleNodes.some(n => !n.exported && !n.nestedExports && !n.declared)) {
      return writeModuleWrapper();
    }
    for (const node of context.moduleNodes.concat(context.exportsNodes)) {
      const name = node.exported && node.exported.name ||
        node.declared && node.declared.exported.name ||
        node.nestedExports && node.nestedExports.name;
      if (!name) {
        context.defaultExports.push(node);
        continue;
      }
      let namedExport = context.namedExports.get(name);
      if (!namedExport) {
        namedExport = [];
        context.namedExports.set(name, namedExport);
      }
      namedExport.push(node);
    }
    // single module.exports = ...
    if (
      context.defaultExports.length === 1 && (
        context.defaultExports[0].exported && context.defaultExports[0].exported.statement ||
        context.defaultExports[0].declared
      ) && !context.namedExports.size
    ) {
      return writeModuleExport();
    }
    // export default
    if (context.defaultExports.length) {
      return writeDefaultExport();
    }
    // export named
    return Promise.resolve(context.isExportPreferDefault())
      .then(preferDefault => {
        if (preferDefault) {
          return writeDefaultExport();
        }
        return writeNamedExport();
      });
  }
  
  function writeModuleWrapper() {
    if (
      context.moduleNodes.length &&
      context.exportsNodes.length &&
      context.exportsNodes[0].rootPos > context.moduleNodes[0].rootPos
    ) {
      context.exportsNodes[0].rootPos = context.moduleNodes[0].rootPos;
    }
    if (context.exportsNodes.length) {
      context.s.appendLeft(
        context.exportsNodes[0].rootPos,
        "let _exports_ = {};\n"
      );
    }
    if (context.moduleNodes.length) {
      context.s.appendLeft(
        context.moduleNodes[0].rootPos,
        `const _module_ = {exports: ${context.exportsNodes.length ? "_exports_" : "{}"}};\n`
      );
    }
    for (const node of context.moduleNodes) {
      context.s.overwrite(node.start, node.end, "_module_", {contentOnly: true});
    }
    for (const node of context.exportsNodes) {
      context.s.overwrite(node.start, node.end, "_exports_", {contentOnly: true});
    }
    if (context.moduleNodes.length) {
      context.s.appendLeft(
        context.topLevel.get().end,
        "\nexport default _module_.exports;"
      );
    } else {
      context.s.appendLeft(
        context.topLevel.get().end,
        "\nexport {_exports_ as default};"
      );
    }
  }
  
  function writeModuleExport() {
    const node = context.defaultExports[0];
    if (node.exported && node.exported.object) {
      return Promise.resolve(
        context.hasDefaultComment(node) ||
        context.isExportPreferDefault()
      )
        .then(preferDefault => {
          if (preferDefault) {
            return writeModuleExportDefault(node);
          }
          return writeModuleExportObject(node);
        });
    }
    return writeModuleExportDefault(node);
  }
  
  function writeModuleExportDefault(node) {
    if (node.declared) {
      // const foo = module.exports = ...
      context.s.overwrite(
        node.declared.id.end,
        node.declared.exported.value.start,
        " = "
      );
      context.s.remove(
        node.declared.exported.value.end,
        node.declared.end
      );
      context.s.appendLeft(
        node.declared.end,
        `;\nexport {${node.declared.id.name} as default};`
      );
    } else {
      // module.exports = ...
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        "export default "
      );
      if (
        node.exported.value.type === "FunctionExpression" ||
        node.exported.value.type === "ClassExpression"
      ) {
        // convert declaration into expression
        if (node.exported.value.id) {
          context.s.appendLeft(node.exported.value.start, "(");
          context.safeOverwrite(node.exported.value.end, node.exported.statement.end, ");");
        } else {
          context.s.remove(node.exported.value.end, node.exported.statement.end);
        }
      } else {
        context.safeOverwrite(node.exported.value.end, node.exported.statement.end, ";");
      }
      if (node.exported.isIife && context.code[node.exported.value.start] !== "(") {
        // wrap iife expression
        context.s.appendRight(node.exported.value.callee.start, "(");
        context.s.appendLeft(node.exported.value.callee.end, ")");
      }
    }
  }
  
  function writeModuleExportObject(node) {
    const {properties} = node.exported.object;
    let start = node.exported.leftMost.start;
    for (let i = 0; i < properties.length; i++) {
      writeProperty(
        start,
        properties[i],
        i > 0
      );
      start = properties[i].value.end;
    }
    // , ... }
    context.s.remove(start, node.exported.statement.end);
  }
  
  function writeProperty(start, property, newLine) {
    if (newLine) {
      context.s.appendLeft(start, "\n");
    }
    if (property.value.type === "Identifier" || property.required) {
      // foo: bar
      context.s.overwrite(
        start,
        property.value.start,
        "export {",
        {contentOnly: true} // don't overwrite previous };
      );
      context.s.appendLeft(
        property.value.end,
        `${property.key.name !== property.value.name ? ` as ${property.key.name}` : ""}}`
      );
    } else {
      // foo: "not an identifier"
      const prefix = property.method ? `function${property.generator ? "*" : ""} ` : "";
      context.s.overwrite(
        start,
        property.value.start,
        `const _export_${property.key.name}_ = ${prefix}`,
        {contentOnly: true}
      );
      context.s.appendLeft(
        property.value.end,
        `;\nexport {_export_${property.key.name}_ as ${property.key.name}}`
      );
    }
    context.s.appendLeft(property.value.end, ";");
  }
  
  function writeNamedExport() {
    for (const [name, nodes] of context.namedExports) {
      let init = 0;
      let assignment = 0;
      let declared = 0;
      for (const node of nodes) {
        if (node.declared) {
          declared++;
          init++;
          assignment++;
        } else if (node.exported) {
          if (node.exported.statement) {
            init++;
          }
          assignment++;
        } else if (node.nestedExports.node.isAssignment) {
          assignment++;
        }
      }
      if (init === 1 && (!declared || nodes.length === 1)) {
        for (const node of nodes) {
          if (node.declared) {
            writeNamedDeclare(node);
          } else if (node.exported && node.exported.statement) {
            writeNamedExports(node, assignment > 1 ? "let" : "const", nodes.length > 1);
          } else {
            writeNestedExports(node);
          }
        }
      } else {
        for (const node of nodes) {
          if (node.declared) {
            node.exported = node.declared.exported;
          }
          writeNestedExports(node);
        }
        writeNamedInit(nodes.reduce((node, curr) => {
          return curr.rootPos < node.rootPos ? curr : node;
        }), name);
      }
    }
  }
  
  function writeNamedDeclare(node) {
    if (node.declared.id.name === node.declared.exported.name) {
      context.s.overwrite(
        node.declared.start,
        node.declared.exported.key.start,
        `export ${node.declared.kind} `
      );
    } else {
      context.s.overwrite(
        node.declared.id.end,
        node.declared.exported.value.start,
        " = "
      );
      context.s.remove(
        node.declared.exported.value.end,
        node.declared.end
      );
      context.s.appendLeft(
        node.declared.end,
        `;\nexport {${node.declared.id.name} as ${node.declared.exported.name}};`
      );
    }
  }
  
  function writeNamedExports(node, kind = "const", shareExport = false) {
    if (node.exported.value.type !== "Identifier" && !node.exported.required || shareExport) {
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        `${kind} _export_${node.exported.name}_ = `,
        {contentOnly: true}
      );
      context.safeOverwrite(
        node.exported.value.end,
        node.exported.statement.end,
        `;\nexport {_export_${node.exported.name}_ as ${node.exported.name}};`
      );
    } else {
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        "export {",
        {contentOnly: true}
      );
      context.safeOverwrite(
        node.exported.value.end,
        node.exported.statement.end,
        `${node.exported.value.name !== node.exported.name ? ` as ${node.exported.name}` : ""}};`
      );
    }
  }
  
  function writeNestedExports(node) {
    const target = node.nestedExports || node.exported;
    context.s.overwrite(
      target.node.start,
      target.node.end,
      `_export_${target.name}_`,
      {contentOnly: true}
    );
  }
  
  function writeNamedInit(node, name) {
    context.s.appendLeft(
      node.rootPos,
      `let _export_${name}_;\nexport {_export_${name}_ as ${name}};\n`
    );
  }
  
  function writeDefaultExport() {
    const nodes = context.moduleNodes.concat(context.exportsNodes);
    let init = 0;
    let assignment = 0;
    for (const node of nodes) {
      if (node.exported) {
        if (node.exported.name) {
          continue;
        }
        if (node.exported.statement) {
          init++;
        }
        if (!node.parentAssign) {
          assignment++;
        }
      } else if (
        node.nestedExports && node.nestedExports.node.isAssignment ||
        node.isAssignment
      ) {
        assignment++;
      }
    }
    if (init === 1) {
      for (const node of nodes) {
        if (node.exported && node.exported.statement && !node.exported.name) {
          writeDefaultExportDeclare(node, assignment === 1 ? "const" : "let");
        } else {
          writeDefaultExportNode(node);
        }
      }
    } else {
      const topIndex = nodes.reduce(
        (r, n) => n.rootPos < r ? n.rootPos : r,
        Infinity
      );
      const kind = assignment ? "let" : "const";
      const defaultValue = !assignment || context.needDefaultObject ? " = {}" : "";
      context.s.appendRight(
        topIndex,
        `${kind} _module_exports_${defaultValue};\nexport {_module_exports_ as default};\n`
      );
      for (const node of nodes) {
        writeDefaultExportNode(node);
      }
    }
  }
  
  function writeDefaultExportDeclare(node, kind) {
    const target = node.childAssign || node;
    context.s.overwrite(
      node.exported.node.start,
      target.exported.assignExpression.left.end,
      `${kind} _module_exports_`,
      {contentOnly: true}
    );
    context.s.appendLeft(node.exported.statement.end, "\nexport {_module_exports_ as default};");
  }
  
  function writeDefaultExportNode(node) {
    if (node.parentAssign && node.parentAssign.childAssign) {
      return; // ignore module.exports = exports = ...
    }
    let start, end;
    if (node.childAssign) {
      start = node.start;
      end = node.childAssign.exported.assignExpression.left.end;
    } else {
      const exported = node.exported || node.nestedExports;
      const target = exported ?
        (exported.name ? exported.node.object : exported.node) :
        node;
      start = target.start;
      end = target.end;
    }
    context.s.overwrite(start, end, "_module_exports_", {contentOnly: true});
  }
}

module.exports = {createExportWriter};
