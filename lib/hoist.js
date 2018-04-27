const isReference = require("is-reference");
const {getRequireInfo, isPreferDefault, pathToName} = require("./util");

function createHoistExportTransformer({s, topLevel, scope}) {
  let moduleDeclarePos = null;
  let exportDeclarePos = null;
  let shouldHoist = false;
  let isTouched = false;
  const moduleNodes = [];
  const exportNodes = [];
  
  return {
    transformExport,
    transformModule,
    writeDeclare,
    writeExport,
    isTouched: () => isTouched,
    shouldHoist: () => shouldHoist
  };
  
  function transformModule(node, parent) {
    if (
      node.name !== "module" || !isReference(node, parent) ||
      scope.has(node.name)
    ) {
      return;
    }
    if (moduleDeclarePos === null) {
      moduleDeclarePos = topLevel.get().start;
    }
    if (!node.isTopLevelExport) {  
      shouldHoist = true;
    }
    moduleNodes.push(node);
  }
  
  function transformExport(node, parent) {
    if (node.name !== "exports" || !isReference(node, parent) || scope.has(node.name)) {
      return;
    }
    if (exportDeclarePos === null) {
      exportDeclarePos = topLevel.get().start;
    }
    if (!node.isTopLevelExport) {
      shouldHoist = true;
    }
    exportNodes.push(node);
  }
  
  function writeDeclare() {
    if (!shouldHoist) {
      return;
    }
    if (moduleDeclarePos !== null && exportDeclarePos !== null && moduleDeclarePos < exportDeclarePos) {
      exportDeclarePos = moduleDeclarePos;
    }
    if (exportDeclarePos !== null) {
      s.appendRight(exportDeclarePos, "let _exports_ = {};\n");
      if (moduleDeclarePos !== null) {
        s.appendRight(moduleDeclarePos, "const _module_ = {exports: _exports_};\n");
      }
    } else {
      s.appendRight(moduleDeclarePos, "const _module_ = {exports: {}};\n");
    }
    isTouched = true;
  }
  
  function writeExport() {
    if (!shouldHoist) {
      return;
    }
    for (const node of moduleNodes) {
      s.overwrite(node.start, node.end, "_module_", {contentOnly: true});
    }
    for (const node of exportNodes) {
      s.overwrite(node.start, node.end, "_exports_", {contentOnly: true});
    }
    if (moduleNodes.length) {
      s.appendRight(topLevel.get().end, "\nexport default _module_.exports;");
    } else {
      s.appendRight(topLevel.get().end, "\nexport default _exports_;");
    }
    isTouched = true;
  }
}

function createHoistImportTransformer({s, topLevel, scope, code}) {
  const imports = new Map;
  let isTouched = false;
  
  return {
    transform,
    write,
    isTouched: () => isTouched
  };
  
  function write({excludeTopLevel = false} = {}) {
    for (const imported of imports.values()) {
      const importPos = excludeTopLevel ? imported.nonTopLevelImportPos : imported.importPos;
      const requires = excludeTopLevel ? 
        imported.requires.filter(r => !r.node.isTopLevelImport) : imported.requires;
        
      if (!requires.length) {
        continue;
      }
      s.appendLeft(
        importPos,
        `import ${imported.preferDefault ? "" : "* as "}${imported.name} from ${JSON.stringify(imported.moduleId)};\n`
      );
      for (const required of requires) {
        s.overwrite(
          required.node.start,
          required.node.end,
          imported.name,
          {contentOnly: true}
        );
      }
      isTouched = true;
    }
  }
  
  function transform(node) {
    if (node.isBareImport || scope.has("require")) {
      return;
    }
    const required = getRequireInfo(node);
    if (!required) {
      return;
    }
    let imported = imports.get(required.value);
    if (!imported) {
      imported = {
        name: `_require_${pathToName(required.value)}_`,
        moduleId: required.value,
        preferDefault: isPreferDefault(code, required),
        requires: [],
        importPos: topLevel.get().start,
        nonTopLevelImportPos: null
      };
      imports.set(required.value, imported);
    }
    if (!required.node.isTopLevelImport && imported.nonTopLevelImportPos === null) {
      imported.nonTopLevelImportPos = topLevel.get().start;
    }
    imported.requires.push(required);
  }
}

module.exports = {
  createHoistExportTransformer,
  createHoistImportTransformer
};
