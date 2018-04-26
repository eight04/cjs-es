const {attachScopes} = require("rollup-pluginutils");

function createTopLevelAnalyzer() {
  const nodes = [];
  let node;
  let parent;
  return {enter, get, isTop, isTopChild};
  
  function enter(_node, _parent) {
    node = _node;
    parent = _parent;
    if (parent && parent.type === "Program") {
      node.topLevel = true;
      nodes.push(node);
    }
  }
  
  function get() {
    return nodes[nodes.length - 1];
  }
  
  function isTop() {
    return !parent || parent.type === "Program";
  }
  
  function isTopChild() {
    return parent.topLevel;
  }
}

function createScopeAnalyzer(ast) {
  let scope = attachScopes(ast, "scope");
  return {enter, leave, has};
  
  function enter(node) {
    if (node.scope) {
      scope = node.scope;
    }
  }
  function leave(node) {
    if (node.scope) {
      scope = node.scope.parent;
    }
  }
  function has(name) {
    return scope.contains(name);
  }
}

function getExportInfo(node) {
  if (node.left.type === "MemberExpression") {
    if (node.left.object.name === "module" && node.left.property.name === "exports") {
      return {
        type: "default",
        left: node.left,
        value: node.right
      };
    }
    if (
      node.left.object.type === "MemberExpression" &&
      node.left.object.object.name === "module" &&
      node.left.object.property.name === "exports"
    ) {
      return {
        type: "named",
        name: node.left.property.name,
        left: node.left,
        value: node.right
      };
    }
    if (node.left.object.name === "exports") {
      return {
        type: "named",
        name: node.left.property.name,
        left: node.left,
        value: node.right
      };
    }
  }
}

function getDynamicImport(node) {
  // CallExpression
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.object.name !== "Promise" ||
    node.callee.property.name !== "resolve"
  ) {
    return;
  }
  if (
    node.arguments.length !== 1 ||
    node.arguments[0].type !== "CallExpression"
  ) {
    return;
  }
  const required = getRequireInfo(node.arguments[0]);
  if (required) {
    return {
      start: node.start,
      end: node.end,
      required
    };
  }
}

function getRequireInfo(node) {
  if (
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "Literal"
  ) {
    return node.arguments[0];
  }
}

function getObjectInfo(node, checkValueType) {
  if (!node.properties.length) {
    return;
  }
  const properties = [];
  for (const prop of node.properties) {
    if (prop.key.type !== "Identifier") {
      return;
    }
    if (checkValueType && prop.value.type !== "Identifier") {
      return;
    }
    if (prop.method) {
      properties.push({
        name: prop.key.name,
        method: true,
        generator: prop.value.generator,
        key: prop.key,
        value: prop.value
      });
    } else {
      // note that if prop.shorthand == true then prop.key == prop.value
      properties.push({
        name: prop.key.name,
        key: prop.key,
        value: prop.value
      });
    }
  }
  return {
    start: node.start,
    end: node.end,
    properties
  };
}

function isPreferDefault(code, node) {
  const rx = /.*?\/\/.*\bdefault\b/y;
  rx.lastIndex = node.end;
  return rx.test(code);
}

module.exports = {
  createScopeAnalyzer,
  createTopLevelAnalyzer,
  getExportInfo,
  getDynamicImport,
  getRequireInfo,
  getObjectInfo,
  isPreferDefault
};
