function createExportWriter(context) {
  context.hasNonTopLevelExport = false;
  context.defaultExports = [];
  context.namedExports = [];
  return {write};
  
  function write() {
    if (!context.moduleNodes.length && !context.exportsNodes.length) {
      return;
    }
    for (const node of context.moduleNodes.concat(context.exportsNodes)) {
      if (!node.exported && !node.declared) {
        context.hasNonTopLevelExport = true;
      } else if (
        node.exported && node.exported.name ||
        node.declared && node.declared.exported.name
      ) {
        context.namedExports.push(node);
      } else {
        context.defaultExports.push(node);
      }
    }
    if (
      context.hasNonTopLevelExport ||
      context.namedExports.length && context.defaultExports.length ||
      context.defaultExports.length > 1 // but why?
    ) {
      // hoist
      return writeHoistExport();
    }
    if (context.defaultExports.length) {
      return writeModuleExport();
    }
    return Promise.resolve(context.isExportPreferDefault())
      .then(preferDefault => {
        if (preferDefault) {
          return writeHoistExport();
        }
        return writeNamedExport();
      });
  }
  
  function writeHoistExport() {
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
    context.s.appendLeft(
      context.topLevel.get().end,
      `\nexport default ${context.moduleNodes.length ? "_module_.exports" : "_exports_"};`
    );
  }
  
  function writeModuleExport() {
    const node = context.moduleNodes[0];
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
        `;\nexport default ${node.declared.id.name};`
      );
    } else {
      // module.exports = ...
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        "export default "
      );
      // FIXME: is it safe to convert expression into declaration?
      if (
        node.exported.value.type === "FunctionExpression" ||
        node.exported.value.type === "ClassExpression"
      ) {
        if (node.exported.value.id) {
          context.s.appendLeft(node.exported.value.start, "(");
          context.s.overwrite(node.exported.value.end, node.exported.statement.end, ");");
        } else {
          context.s.remove(node.exported.value.end, node.exported.statement.end);
        }
      } else {
        context.s.overwrite(node.exported.value.end, node.exported.statement.end, ";");
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
    for (const node of context.namedExports) {
      if (node.declared) {
        writeNamedDeclare(node);
      } else {
        writeNamedExports(node);
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
  
  function writeNamedExports(node) {
    if (node.exported.value.type !== "Identifier" && !node.exported.required) {
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        `const _export_${node.exported.name}_ = `,
        {contentOnly: true}
      );
      context.s.overwrite(
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
      context.s.overwrite(
        node.exported.value.end,
        node.exported.statement.end,
        `${node.exported.value.name !== node.exported.name ? ` as ${node.exported.name}` : ""}};`
      );
    }
  }
}

module.exports = {createExportWriter};
