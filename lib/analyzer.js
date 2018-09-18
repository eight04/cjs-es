const {walk} = require("estree-walker");
const isReference = require("is-reference");
const {
  getDeclareImport,
  getDeclareExport,
  getDynamicImport,
  getExportInfo,
  getLeftMost,
  getRequireInfo,
  getNestedExports
} = require("./util");

function createAnalyzer(context) {
  context.requireNodes = [];
  context.moduleNodes = [];
  context.exportsNodes = [];
  context.nonNamespaceIds = new Set;
  return {analyze};
  
  function analyzeDeclareImport(node) {
    const declarators = getDeclareImport(node);
    for (const declarator of declarators) {
      declarator.node.declarator = declarator; // we need this to work with siblings
      declarator.required.node.declarator = declarator;
      declarator.required.node.rootPos = context.topLevel.get().start;
      context.requireNodes.push(declarator.required.node);
      declarator.node.shouldSkip = true;
    }
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
    declared.exported.assignExpression.isAnalyzed = true;
  }
  
  function analyzeAssignExportTop(node) {
    const exported = analyzeAssignExport(node.expression);
    if (exported) {
      exported.statement = node;
      node.expression.isAnalyzed = true;
    }
  }
  
  function analyzeAssignExport(node) {
    if (node.type !== "AssignmentExpression" || node.isAnalyzed) {
      return;
    }
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
    if (node.right.type === "AssignmentExpression") {
      getLeftMost(node.right.left).parentAssign = exported.leftMost;
    }
    if (exported.leftMost.parentAssign) {
      exported.leftMost.parentAssign.childAssign = exported.leftMost;
    }
    return exported;
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
  
  function analyzeNestedExports(node) {
    const nestedExports = getNestedExports(node);
    if (!nestedExports || context.scope.has(nestedExports.leftMost.name)) {
      return;
    }
    nestedExports.leftMost.nestedExports = nestedExports;
    nestedExports.leftMost.rootPos = context.topLevel.get().start;
    if (nestedExports.leftMost.name === "module") {
      context.moduleNodes.push(nestedExports.leftMost);
    } else {
      context.exportsNodes.push(nestedExports.leftMost);
    }
    context.skip();
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
    const left = getLeftMost(node.left);
    if (
      left.type === "Identifier" &&
      (!context.scope || context.scope.isRootVar(left.name))
    ) {
      context.nonNamespaceIds.add(left.name);
    }
  }
  
  function analyzeClass(node) {
    if (
      node.superClass &&
      node.superClass.type === "Identifier" &&
      (!context.scope || context.scope.isRootVar(node.superClass.name))
    ) {
      context.nonNamespaceIds.add(node.superClass.name);
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
        context.assignment.enter(node);
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
      analyzeAssignExportTop(node);
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
      analyzeAssignExport(node);
    } else if (node.type === "ClassExpression" || node.type === "ClassDeclaration") {
      analyzeClass(node);
    } else if (node.type === "MemberExpression") {
      analyzeNestedExports(node);
    }
    if (!context.nested && !context.topLevel.isTop()) {
      context.skip();
    }
  }
}

module.exports = {createAnalyzer};
