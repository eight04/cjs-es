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
    return writeExportsExport();
  }
  
  function writeHoistExport() {
    // hoist export always exports a default member
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
    s.move(property.value.start, property.value.end, property.key.end);
    s.move(property.key.start, property.key.end, property.value.end);
    if (semi) {
      context.s.appendRight(property.value.end, ";");
    }
  }
  
  function writeExportsExport() {}
}

module.exports = {createExportWriter};