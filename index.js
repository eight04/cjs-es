const {walk} = require("estree-walker");
const MagicString = require("magic-string");
const {createTopLevelAnalyzer, createScopeAnalyzer} = require("./lib/util");
const {
  createTopLevelExportTransformer,
  createTopLevelImportTransformer
} = require("./lib/top-level");
const {createDynamicImportTransformer} = require("./lib/dynamic");
const {
  createHoistExportTransformer,
  createHoistImportTransformer
} = require("./lib/hoist");

function makeCallable(func) {
  if (typeof func === "function") {
    return func;
  }
  return () => func;
}

function transform({
  parse,
  code,
  sourceMap = false,
  importStyle = "named",
  exportStyle = "named",
  hoist = false,
  dynamicImport = false
} = {}) {
  
  importStyle = makeCallable(importStyle);
  exportStyle = makeCallable(exportStyle);
  
  const s = new MagicString(code);
  const ast = parse(code);
  const topLevel = createTopLevelAnalyzer();
  const scope = hoist || dynamicImport ? createScopeAnalyzer(ast) : null;
  
  const topLevelImportTransformer = createTopLevelImportTransformer({code, s, importStyle, hoist});
  const topLevelExportTransformer = createTopLevelExportTransformer({code, s, exportStyle});
  
  const dynamicImportTransformer = dynamicImport ? createDynamicImportTransformer({s, scope}) : null;
  
  const hoistImportTransformer = hoist ?
    createHoistImportTransformer({s, topLevel, scope, code}) : null;
  const hoistExportTransformer = hoist ?
    createHoistExportTransformer({s, topLevel, scope}) : null;
  
  walk(ast, {
    enter(node, parent) {
      if (node.shouldSkip) {
        this.skip();
        return;
      }
      topLevel.enter(node, parent);
      if (scope) {
        scope.enter(node);
      }
      if (node.type === "VariableDeclaration" && topLevel.isTop()) {
        topLevelImportTransformer.transformImportDeclare(node);
        if (!hoist || !hoistExportTransformer.shouldHoist()) {
          topLevelExportTransformer.transformExportDeclare(node);
        }
      } else if (node.type === "AssignmentExpression" && topLevel.isTopChild()) {
        if (!hoist || !hoistExportTransformer.shouldHoist()) {
          topLevelExportTransformer.transformExportAssign(node);
        }
      } else if (node.type === "CallExpression") {
        if (dynamicImport) {
          dynamicImportTransformer.transform(node);
        }
        if (topLevel.isTopChild()) {
          topLevelImportTransformer.transformImportBare(node);
        }
        if (hoist) {
          hoistImportTransformer.transform(node);
        }
      } else if (node.type === "Identifier" && hoist) {
        hoistExportTransformer.transformExport(node, parent);
        hoistExportTransformer.transformModule(node, parent);
      }
      if (!dynamicImport && !hoist && !topLevel.isTop()) {
        this.skip();
        if (scope) {
          scope.leave(node);
        }
      }
    },
    leave(node) {
      if (scope) {
        scope.leave(node);
      }
    }
  });
  
  if (hoist) {
    hoistExportTransformer.writeDeclare();
    hoistExportTransformer.writeExport();
  }
  if (!hoist || !hoistExportTransformer.isTouched()) {
    topLevelExportTransformer.writeExport();
  }
  if (hoist) {
    hoistImportTransformer.write({
      excludeTopLevel: topLevelExportTransformer.isTouched()
    });
  }
  
  const isTouched =
    topLevelImportTransformer.isTouched() ||
    topLevelExportTransformer.isTouched() ||
    (hoist && (
      hoistImportTransformer.isTouched() ||
      hoistExportTransformer.isTouched()
    )) ||
    dynamicImport && dynamicImportTransformer.isTouched();
  
  return {
    code: isTouched ? s.toString() : code,
    map: sourceMap && s.generateMap(),
    isTouched
  };
}

module.exports = {transform};
