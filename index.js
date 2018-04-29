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

function createContext(options) {
  const context = Object.assign({}, options);
  
  context.importStyleCache = new Map;
  context.isImportPreferDefault = id => {
    if (context.importStyleCache.has(id)) {
      return Promise.resolve(context.importStyleCache.get(id));
    }
    if (typeof options.importStyle === "function") {
      return Promise.resolve(options.importStyle(id))
        .then(style => {
          const result = style === "default";
          context.importStyleCache.set(id, result);
          return result;
        });
    }
    const result = options.importStyle === "default";
    context.importStyleCache.set(id, result);
    return Promise.resolve(result);
  };
  
  context.exportStyleCache = null;
  context.isExportPreferDefault = () => {
    if (context.exportStyleCache != null) {
      return Promise.resolve(context.exportStyleCache);
    }
    if (typeof options.exportStyle === "function") {
      return Promise.resolve(options.exportStyle())
        .then(style => {
          const result = style === "default";
          context.exportStyleCache = result;
          return Promise.resolve(result);
        });
    }
    const result = options.exportStyle === "default";
    context.exportStyleCache = result;
    return Promise.resolve(result);
  };
  
  if (!context.ast) {
    context.ast = options.parse(options.code);
  }
  
  context.s = new MagicString(options.code);
  context.topLevel = createTopLevelAnalyzer();
  context.scope = options.hoist || options.dynamicImport ? createScopeAnalyzer(context.ast);
  context.walkContext = null;
  context.skip = () => {
    context.walkContext.skip();
    if (context.scope) {
      context.scope.leave(context.node);
    }
  };
  context.isTouched = false;
  
  return context;
}

function createAnalyzer(context) {
  context.requireNodes = [];
  context.moduleNodes = [];
  context.exportsNodes = [];
  return {analyze};
  
  function analyzeDeclareImport(node) {
    const declared = getDeclareImport(node);
    if (!declared) {
      return;
    }
    declared.required.node.declared = declared;
    declared.required.node.rootPos = context.topLevel.get().start;
    context.requireNodes.push(declared.required.node);
    context.skip();
  }
  
  function analyzeDeclareExport(node) {
    const declared = getDeclareExport(node);
    if (!declared) {
      return;
    }
    declared.exported.leftMost.declared = declared;
    declared.exported.leftMost.rootPos = context.topLevel.get().start;
    if (declared.exported.leftMost.name === "module") {
      context.moduleNodes.push(declared.exported.leftMost);
    } else {
      context.exportsNodes.push(declared.exported.leftMost);
    }
    declared.exported.left.shouldSkip = true;
  }
  
  function analyzeAssignExport(node) {
    const exported = getExportInfo(node);
    if (!exported) {
      return;
    }
    exported.leftMost.exported = exported;
    exported.leftMost.rootPos = context.topLevel.get().start;
    if (exported.leftMost.name === "module") {
      context.moduleNodes.push(exported.leftMost);
    } else {
      context.exportsNodes.push(exported.leftMost);
    }
    node.left.shouldSkip = true;
  }
  
  function analyzeDynamicImport(node) {
    const imported = getDynamicImport(node);
    if (!imported || context.scope.has("require")) {
      return;
    }
    imported.required.node.dynamicImported = imported;
    imported.required.node.rootPos = context.topLevel.get().start;
    context.requireNodes.push(imported.required.node);
    context.skip();
  }
  
  function analyzeRequire(node) {
    const required = getRequireInfo(node);
    if (!required) {
      return;
    }
    if (context.topLevel.isTopChild()) {
      node.topRequired = required;
    } else {
      node.required = required;
    }
    node.rootPos = context.topLevel.get().start;
    context.requireNodes.push(node);
    context.skip();
  }
  
  function analyzeExports(node) {
    if (node.name !== "exports") {
      return;
    }
    node.rootPos = context.topLevel.get().start;
    context.exportsNodes.push(node);
  }
  
  function analyzeModule(node) {
    if (node.name !== "module") {
      return;
    }
    node.rootPos = context.topLevel.get().start;
    context.moduleNodes.push(node);
  }
  
  function analyze(node, parent) {
    if (node.type === "VariableDeclaration" && topLevel.isTop()) {
      analyzeDeclareImport(node);
      analyzeDeclareExport(node);
    } else if (node.type === "AssignmentExpression" && topLevel.isTopChild()) {
      analyzeAssignExport(node);
    } else if (node.type === "CallExpression") {
      if (context.dynamicImport) {
        analyzeDynamicImport(node);
      }
      analyzeRequire(node);
    } else if (
      node.type === "Identifier" && context.hoist &&
      isReference(node, parent) && !context.scope.has(node.name)
    ) {
      analyzeExports(node);
      analyzeModule(node);
    }
    if (!context.dynamicImport && !context.hoist && !context.topLevel.isTop()) {
      context.skip();
    }
  }
}

function transform(options) {
  const context = createContext(options);
  const analyzer = createAnalyzer(context);

  function doWalk() {
    walk(context.ast, {
      enter(node, parent) {
        if (node.shouldSkip) {
          this.skip();
          return;
        }
        context.node = node;
        context.parent = parent;
        context.topLevel.enter(node);
        if (context.scope) {
          context.scope.enter(node);
        }
        context.walkContext = this;
        analyzer.enter(node, parent);
      },
      leave(node) {
        if (context.scope) {
          context.scope.leave(node);
        }
      }
    });
  }
  
  try {
    doWalk();
  } catch (err) {
    if (!err.node) {
      err.node = context.node;
    }
    throw err;
  }

  return createWriter(context).write()
    .then(() => ({
      code: context.isTouched ? context.s.toString() : context.code,
      map: options.sourceMap && context.s.generateMap(),
      isTouched: context.isTouched
    }));
}

module.exports = {transform};
