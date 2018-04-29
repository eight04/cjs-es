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

module.exports = {createAnalyzer};