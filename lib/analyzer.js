const {
  getDeclareImport,
  getDeclareExport,
  getDynamicImport,
  getExportInfo,
  getLeftMost,
  getRequireInfo,
  getNestedExports
} = require("./util");

async function createAnalyzer(context) {
  const [{walk}, {default: isReference}] = await Promise.all([
    import("estree-walker"),
    import("is-reference")
  ]);
  context.requireNodes = [];
  context.moduleNodes = [];
  context.exportsNodes = [];
  context.needDefaultObject = false;
  context.importedProperties = new Map;
  context.shouldImportDefault = new Set;
  return {analyze};
  
  function addImportedProperties(id, prop) {
    let names = context.importedProperties.get(id);
    if (!names) {
      names = [];
      context.importedProperties.set(id, names);
    }
    names.push(prop);
  }
  
  function analyzeDeclareImport(node) {
    const isTopLevel = context.topLevel.isTop();
    const declarators = getDeclareImport(node);
    for (const declarator of declarators) {
      if (isTopLevel) {
        // don't define .declarator for nested requires?
        declarator.node.declarator = declarator; // we need this to work with siblings
        declarator.required.node.declarator = declarator;
      }
      declarator.required.node.required = declarator.required;
      declarator.required.node.rootPos = context.topLevel.get().start;
      context.requireNodes.push(declarator.required.node);
      declarator.node.shouldSkip = true;
      if (declarator.isSingleBinding) {
        context.scope.setMeta(declarator.left.name, "importedFrom", declarator.required.value);
      } else if (declarator.property) {
        addImportedProperties(declarator.required.value, declarator.property.name);
      } else if (declarator.object) {
        for (const prop of declarator.object.properties) {
          addImportedProperties(declarator.required.value, prop.value.name);
        }
      }
    }
  }
  
  function analyzeDeclareExport(node) {
    const declared = getDeclareExport(node);
    if (!declared || !context.topLevel.isTop()) {
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
    if (!exported || context.scope.has(exported.leftMost.name)) {
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
    if (exported.leftMost.parentAssign && !exported.name) {
      exported.leftMost.parentAssign.childAssign = exported.leftMost;
    }
    return exported;
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
    if (!required || context.scope.has("require")) {
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
  
  function analyzeExports(node, parent) {
    if (node.name !== "exports" || context.scope.has("exports")) {
      return;
    }
    node.rootPos = context.topLevel.get().start;
    if (parent.type === "UnaryExpression" && parent.operator === "typeof") {
      context.needDefaultObject = true;
    }
    context.exportsNodes.push(node);
  }
  
  function analyzeModule(node) {
    if (node.name !== "module" || context.scope.has("module")) {
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
    node.callee.callable = true;
    if (node.callee.type === "Identifier") {
      const importedFrom = context.scope.getMeta(node.callee.name, "importedFrom");
      if (importedFrom) {
        context.shouldImportDefault.add(importedFrom);
      }
    }
  }
  
  function analyzeTag(node) {
    if (node.tag.type === "Identifier") {
      const importedFrom = context.scope.getMeta(node.tag.name, "importedFrom");
      if (importedFrom) {
        context.shouldImportDefault.add(importedFrom);
      }      
    }
  }
  
  function analyzeReassign(node) {
    const left = getLeftMost(node.left);
    if (left.type === "Identifier") {
      const importedFrom = context.scope.getMeta(left.name, "importedFrom");
      if (importedFrom) {
        context.shouldImportDefault.add(importedFrom);
      }
    }
  }
  
  function analyzeClass(node) {
    if (node.superClass && node.superClass.type === "Identifier") {
      const importedFrom = context.scope.getMeta(node.superClass.name, "importedFrom");
      if (importedFrom) {
        context.shouldImportDefault.add(importedFrom);
      }
    }
  }
  
  function analyzeRequireId(node) {
    if (node.name === "require" && !context.scope.has(node.name)) {
      context.warn("Unconverted `require`", node.start);
    }
  }
  
  function analyzeThisExpression() {
    const fnNode = context.scope.findFunction();
    if (fnNode) {
      fnNode.containThis = true;
    }
  }
  
  function analyzeMemberAccess(node) {
    if (node.type !== "MemberExpression" ||
        node.object.type !== "Identifier" ||
        node.property.type !== "Identifier") {
      return;
    }
    const importedFrom = context.scope.getMeta(node.object.name, "importedFrom");
    if (importedFrom) {
      addImportedProperties(importedFrom, node.property.name);
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
        context.scope.enter(node);
        context.walkContext = this;
        analyzeNode(node, parent);
      },
      leave(node) {
        context.scope.leave(node);
      }
    });
  }
  
  function analyzeNode(node, parent) {
    if (node.type === "VariableDeclaration") {
      analyzeDeclareImport(node);
      analyzeDeclareExport(node);
    } else if (node.type === "ExpressionStatement" && context.topLevel.isTop()) {
      analyzeAssignExportTop(node);
    } else if (node.type === "CallExpression") {
      analyzeDynamicImport(node);
      analyzeRequire(node, parent);
      analyzeCallable(node);
    } else if (node.type === "Identifier" && isReference(node, parent)) {
      analyzeExports(node, parent);
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
      analyzeMemberAccess(node);
    } else if (node.type === "ThisExpression") {
      analyzeThisExpression();
    }
    if (!context.nested && !context.topLevel.isTop()) {
      context.skip();
    }
  }
}

module.exports = {createAnalyzer};
