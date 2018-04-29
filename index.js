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
  
  context.topLevel = createTopLevelAnalyzer();
  context.scope = options.hoist || options.dynamicImport ? createScopeAnalyzer(context.ast);
  context.walkContext = null;
  context.skip = () => {
    context.walkContext.skip();
    if (context.scope) {
      context.scope.leave(context.node);
    }
  };
  context.hasDefaultComment = node => {
    return hasDefaultComment(context.code, node);
  };
  
  return context;
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
