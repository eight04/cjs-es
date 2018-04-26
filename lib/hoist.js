const isReference = require("is-reference");
const {getRequireInfo, isPreferDefault, pathToName} = require("./util");

function createHoistExportTransformer({s, topLevel, scope}) {
  let moduleDeclarePos;
  let exportDeclarePos;
  let isExportDeclared = false;
  let isModuleDeclared = false;
  let isTouched = false;
  
  return {
    transformExport,
    transformModule,
    writeDeclare,
    writeExport,
    isTouched: () => isTouched,
    isModuleDeclared: () => isModuleDeclared
  };
  
  function transformModule(node, parent) {
    if (
      node.name !== "module" || !isReference(node, parent) ||
      scope.has(node.name) || node.isBareExport
    ) {
      return;
    }
    if (!isModuleDeclared) {
      moduleDeclarePos = topLevel.get().start;
      isModuleDeclared = true;
    }
    s.overwrite(node.start, node.end, "_module_", {contentOnly: true});
    isTouched = true;
  }
  
  function transformExport(node, parent) {
    if (node.name !== "exports" || !isReference(node, parent) || scope.has(node.name)) {
      return;
    }
    if (!isExportDeclared) {
      exportDeclarePos = topLevel.get().start;
      isExportDeclared = true;
    }
    s.overwrite(node.start, node.end, "_exports_", {contentOnly: true});
    isTouched = true;
  }
  
  function writeDeclare() {
    if (isExportDeclared && isModuleDeclared && moduleDeclarePos < exportDeclarePos) {
      exportDeclarePos = moduleDeclarePos;
    }
    if (isExportDeclared) {
      s.appendRight(exportDeclarePos, "let _exports_ = {};\n");
      isTouched = true;
    }
    if (isModuleDeclared) {
      if (isExportDeclared) {
        s.appendRight(moduleDeclarePos, "const _module_ = {exports: _exports_};\n");
      } else {
        s.appendRight(moduleDeclarePos, "const _module_ = {exports: {}};\n");
      }
      isTouched = true;
    }
  }
  
  function writeExport() {
    if (isModuleDeclared) {
      s.appendRight(topLevel.get().end, "\nexport default _module_.exports;");
      isTouched = true;
    } else if (isExportDeclared) {
      s.appendRight(topLevel.get().end, "\nexport default _exports_;");
      isTouched = true;
    }
  }
}

function createHoistImportTransformer({s, topLevel, scope, code}) {
  const imports = new Map;
  let isTouched = false;
  
  return {
    transform,
    isTouched: () => isTouched
  };
  
  function transform(node) {
    if (node.shouldSkip || scope.has("require")) {
      return;
    }
    const required = getRequireInfo(node);
    if (!required) {
      return;
    }
    if (!imports.has(required.value)) {
      const name = `_require_${pathToName(required.value)}_`;
      imports.set(required.value, name);
      s.appendLeft(
        topLevel.get().start,
        `import ${isPreferDefault(code, required) ? "" : "* as "}${name} from ${JSON.stringify(required.value)};\n`
      );
    }
    const name = imports.get(required.value);
    s.overwrite(node.start, node.end, name, {contentOnly: true});
    isTouched = true;
  }
}

module.exports = {
  createHoistExportTransformer,
  createHoistImportTransformer
};
