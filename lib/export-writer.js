function createExportWriter(context) {
  return {write};
  
  function write() {
    if (!context.moduleNodes.length && !context.exportsNodes.length) {
      return;
    }
    if (
      context.hasNonTopLevelExport ||
      context.exportsNodes.length && context.moduleNodes.length || // mixed module.exports with exports
      context.moduleNodes.length > 1 // but why?
    ) {
      // hoist
      return writeHoistExport();
    }
    if (context.moduleNodes.length) {
      return writeModuleExport();
    }
    return Promise.resolve(context.isExportPreferDefault())
      .then(preferDefault => {
        if (preferDefault) {
          return writeHoistExport();
        }
        return writeExportsExport();
      });
  }
  
  function writeHoistExport() {
    // hoist export always exports a default member
    if (
      context.moduleNodes.length &&
      context.exportsNodes.length &&
      context.moduleNodes[0].rootPos > context.exportsNodes[0].rootPos
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
  }
  
  function writeModuleExport() {
    const node = context.moduleNodes[0];
    if (node.exported.object) {
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
    context.s.overwrite(
      node.exported.leftMost.start,
      node.exported.value.start,
      "export default "
    );
  }
  
  function writeModuleExportObject(node) {
    const {properties} = node.exported.object;
    let start = node.exported.leftMost.start;
    for (let i = 0; i < properties.length; i++) {
      writeProperty(
        start,
        properties[i],
        i > 0,
        i < properties.length - 1
      );
      start = properties[i].value.end;
    }
    // , ... }
    context.s.remove(start, node.end);
  }
  
  function writeProperty(start, property, newLine, semi) {
    if (newLine) {
      context.s.appendLeft(start, "\n");
    }
    if (property.value.type === "Identifier" || property.required) {
      // foo: bar
      context.s.overwrite(
        start,
        property.key.start,
        "export {",
        {contentOnly: true} // don't overwrite previous };
      );
      context.s.overwrite(
        property.key.end,
        property.value.start,
        " as "
      );
    } else {
      // foo: "not an identifier"
      const prefix = property.method ? `function${property.generator ? "*", ""} ` : "";
      s.overwrite(
        start,
        property.key.start,
        `const _export_${property.name}_ = ${prefix}`,
        {contentOnly: true}
      );
      s.overwrite(
        property.key.end,
        property.value.start,
        `;\nexport {_export_${property.name}_ as `
      );
    }
    context.s.appendRight(property.value.end, "}"); // don't stick to id or it would be moved together.
    // exchange id
    // FIXME: what is the correct way to exchange two ranges?
    context.s.move(property.value.start, property.value.end, property.key.end);
    context.s.move(property.key.start, property.key.end, property.value.end);
    if (semi) {
      context.s.appendRight(property.value.end, ";");
    }
  }
  
  function writeExportsExport() {
    for (const node of context.exportsNodes) {
      if (node.exported.value.type !== "Identifier" && !node.exported.required) {
        context.s.overwrite(
          node.exported.leftMost.start,
          node.exported.left.property.start,
          `const _export_${exported.name}_ = `,
          {contentOnly: true}
        );
        context.s.overwrite(
          node.exported.left.property.end,
          node.exported.right.start,
          `;\nexport {_export_${exported.name}_ as `
        );
      } else {
        context.s.overwrite(
          node.exported.leftMost.start,
          node.exported.left.property.start,
          "export {",
          {contentOnly: true}
        );
        context.s.overwrite(
          node.exported.left.property.end,
          node.exported.right.start,
          " as "
        );
      }
      context.s.appendRight(node.exported.right.end, "}"); // don't stick to id or it would be moved together.
      // exchange id
      // FIXME: what is the correct way to exchange two ranges?
      context.s.move(
        node.exported.left.property.start,
        node.exported.left.property.end,
        node.exported.right.end
      );
      context.s.move(
        node.exported.right.start,
        node.exported.right.end,
        node.exported.left.end
      );
    }
  }
}

module.exports = {createExportWriter};
