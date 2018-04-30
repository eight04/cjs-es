const {attachScopes} = require("rollup-pluginutils");

const RX_DEFAULT = /.*?\/\/.*\bdefault\b/y;

function createTopLevelAnalyzer() {
  const nodes = [];
  let parent;
  return {enter, get, isTop, isTopChild};
  
  function enter(node, _parent) {
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
    return parent && parent.topLevel;
  }
}

function createScopeAnalyzer(ast) {
  const rootScope = attachScopes(ast, "scope");
  let scope = rootScope;
  return {enter, leave, has, isRootVar};
  
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
  function isRootVar(name) {
    // find declare scope
    let declareScope = scope;
    while (declareScope && !declareScope.declarations[name]) {
      declareScope = declareScope.parent;
    }
    return declareScope === rootScope;
  }
}

function getExportInfo(node) {
  if (node.left.type !== "MemberExpression") {
    return;
  }
  if (node.left.object.name === "module" && node.left.property.name === "exports") {
    // module.exports = ...
    return {
      left: node.left,
      leftMost: node.left.object,
      key: node.left.property,
      value: node.right,
      object: node.right.type === "ObjectExpression" && node.right.properties.length ?
        getObjectInfo(node.right) : null
    };
  }
  
  let leftMost;
  if (
    node.left.object.type === "MemberExpression" &&
    node.left.object.object.name === "module" &&
    node.left.object.property.name === "exports"
  ) {
    // module.exports.foo = ...
    leftMost = node.left.object.object;
  } else if (node.left.object.name === "exports") {
    // exports.foo = ...
    leftMost = node.left.object;
  } else {
    return;
  }
  return {
    name: node.left.property.name,
    left: node.left,
    leftMost,
    key: node.left.property,
    value: node.right,
    required: node.right.type === "CallExpression" && getRequireInfo(node.right)
  };
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

function getDeclareExport(node) {
  if (node.declarations.length !== 1) {
    return;
  }
  const dec = node.declarations[0];
  if (dec.id.type !== "Identifier" || !dec.init || dec.init.type !== "AssignmentExpression") {
    return;
  }
  const exported = getExportInfo(dec.init);
  if (!exported) {
    return;
  }
  if (exported.name === dec.id.name) {
    return {
      start: node.start,
      end: node.end,
      kind: node.kind,
      exported
    };
  }
}

function getDeclareImport(node) {
  if (node.declarations.length !== 1) {
    return;
  }
  const dec = node.declarations[0];
  if (!dec.init) {
    return;
  }
  let required;
  let property;
  if (dec.init.type === "CallExpression") {
    required = getRequireInfo(dec.init);
  } else if (
    dec.init.type === "MemberExpression" &&
    dec.init.object.type === "CallExpression" &&
    dec.init.property.type === "Identifier"
  ) {
    required = getRequireInfo(dec.init.object);
    property = dec.init.property;
  }
  if (!required) {
    return;
  }
  let object;
  if (!property && dec.id.type === "ObjectPattern") {
    object = getObjectInfo(dec.id, true);
    if (!object) {
      return;
    }
  } else if (dec.id.type !== "Identifier") {
    return;
  }
  return {
    isSingleBinding: !object && !property,
    object,
    property,
    left: dec.id,
    right: dec.init,
    required,
    node
  };
}

function getRequireInfo(node) {
  if (
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "Literal"
  ) {
    return {
      node,
      start: node.arguments[0].start,
      end: node.arguments[0].end,
      value: node.arguments[0].value,
    };
  }
}

function getObjectInfo(node, checkValueType) {
  if (!node.properties.length) {
    return;
  }
  const properties = [];
  // property might be a require call
  const requires = [];
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
      const required = prop.value.type === "CallExpression" &&
        getRequireInfo(prop.value);
      properties.push({
        name: prop.key.name,
        key: prop.key,
        value: prop.value,
        required
      });
      if (required) {
        requires.push(required);
      }
    }
  }
  return {
    start: node.start,
    end: node.end,
    properties,
    requires
  };
}

function hasDefaultComment(code, node) {
  RX_DEFAULT.lastIndex = node.end;
  return RX_DEFAULT.test(code);
}

function pathToName(s) {
  return s.replace(/[\W_]/g, c => {
    if (c == "/" || c == "\\") {
      return "$";
    }
    if (c == "_") {
      return "__";
    }
    return "_";
  });
}

module.exports = {
  createScopeAnalyzer,
  createTopLevelAnalyzer,
  getDeclareExport,
  getDeclareImport,
  getDynamicImport,
  getExportInfo,
  getRequireInfo,
  hasDefaultComment,
  pathToName
};
