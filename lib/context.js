const {
  createTopLevelAnalyzer,
  createScopeAnalyzer,
  createAssignmentAnalyzer,
  hasDefaultComment
} = require("./util");

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
  context.scope = createScopeAnalyzer(context.ast, !options.nested);
  context.assignment = createAssignmentAnalyzer();
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
  context.warn = (message, pos) => {
    if (options.warn) {
      if (pos == null && context.node) {
        pos = context.node.start;
      }
      options.warn(message, pos);
    } else {
      // eslint-disable-next-line no-console
      console.error(message + (pos != null ? ` at index ${pos}` : ""));
    }
  };
  
  return context;
}

module.exports = {createContext};
