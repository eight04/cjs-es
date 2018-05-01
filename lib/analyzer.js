const {walk} = require("estree-walker");
const isReference = require("is-reference");
const {
  getDeclareImport,
  getDeclareExport,
  getDynamicImport,
  getExportInfo,
  getRequireInfo,
} = require("./util");

function createAnalyzer(context) {
  context.requireNodes = [];
  context.moduleNodes = [];
  context.exportsNodes = [];
  context.nonNamespaceIds = new Set;
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
    if (node.expression.type !== "AssignmentExpression") {
      return;
    }
    const exported = getExportInfo(node.expression);
    if (!exported) {
      return;
    }
    exported.statement = node;
    exported.leftMost.exported = exported;
    exported.leftMost.rootPos = context.topLevel.get().start;
    if (exported.leftMost.name === "module") {
      context.moduleNodes.push(exported.leftMost);
    } else {
      context.exportsNodes.push(exported.leftMost);
    }
    node.expression.left.shouldSkip = true;
  }
  
  function analyzeDynamicImport(node) {
    const imported = getDynamicImport(node);
    if (!imported || context.scope && context.scope.has("require")) {
      return;
    }
    imported.required.node.dynamicImported = imported;
    imported.required.node.rootPos = context.topLevel.get().start;
    context.requireNodes.push(imported.required.node);
    context.skip();
  }
  
  function analyzeRequire(node) {
    const required = getRequireInfo(node);
    if (!required || context.scope && context.scope.has("require")) {
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
    if (node.name !== "exports" || context.scope && context.scope.has("exports")) {
      return;
    }
    node.rootPos = context.topLevel.get().start;
    context.exportsNodes.push(node);
  }
  
  function analyzeModule(node) {
    if (node.name !== "module" || context.scope && context.scope.has("module")) {
      return;
    }
    node.rootPos = context.topLevel.get().start;
    context.moduleNodes.push(node);
  }
  
  function analyzeCallable(node) {
    if (
      node.callee.type === "Identifier" &&
      (!context.scope || context.scope.isRootVar(node.callee.name))
    ) {
      context.nonNamespaceIds.add(node.callee.name);
    } else if (node.callee.type === "CallExpression") {
      node.callee.callable = true;
    }
  }
  
  function analyzeTag(node) {
    if (
      node.tag.type === "Identifier" &&
      (!context.scope || context.scope.isRootVar(node.tag.name))
    ) {
      context.nonNamespaceIds.add(node.tag.name);
    }
  }
  
  function analyzeReassign(node) {
    let left = node.left;
    while (left.type === "MemberExpression") {
      left = left.object;
    }
    if (
      left.type === "Identifier" &&
      (!context.scope || context.scope.isRootVar(left.name))
    ) {
      context.nonNamespaceIds.add(left.name);
    }
  }
  
  function analyzeRequireId(node) {
    if (node.name === "require" && (!context.scope || !context.scope.has(node.name))) {
      context.warn("Unconverted `require`", node.start);
    }
  }
  
  function analyze() {
    walk(context.ast, {
      enter(node, parent) {
        if (node.shouldSkip) {
          this.skip();
          return;
        }
        context.node = node;
        context.parent = parent;
        context.topLevel.enter(node, parent);
        if (context.scope) {
          context.scope.enter(node);
        }
        context.walkContext = this;
        analyzeNode(node, parent);
      },
      leave(node) {
        if (context.scope) {
          context.scope.leave(node);
        }
      }
    });
  }
  
  function analyzeNode(node, parent) {
    if (node.type === "VariableDeclaration" && context.topLevel.isTop()) {
      analyzeDeclareImport(node);
      analyzeDeclareExport(node);
    } else if (node.type === "ExpressionStatement" && context.topLevel.isTop()) {
      analyzeAssignExport(node);
    } else if (node.type === "CallExpression") {
      analyzeDynamicImport(node);
      analyzeRequire(node);
      analyzeCallable(node);
    } else if (node.type === "Identifier" && isReference(node, parent)) {
      analyzeExports(node);
      analyzeModule(node);
      analyzeRequireId(node);
    } else if (node.type === "NewExpression") {
      analyzeCallable(node);
    } else if (node.type === "TaggedTemplateExpression") {
      analyzeTag(node);
    } else if (node.type === "AssignmentExpression") {
      analyzeReassign(node);
    }
    if (!context.nested && !context.topLevel.isTop()) {
      context.skip();
    }
  }
}

module.exports = {createAnalyzer};
