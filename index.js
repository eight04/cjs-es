const {walk} = require("estree-walker");
const MagicString = require("magic-string");

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

function getDeclareExport(node) {
  if (node.declarations.length !== 1) {
    return;
  }
  const dec = node.declarations[0];
  if (dec.id.type !== "Identifier" || dec.init.type !== "AssignmentExpression") {
    return;
  }
  const exported = getExportInfo(dec.init);
  if (!exported) {
    return;
  }
  if (exported.name === dec.id.name) {
    return {
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
  if (dec.init.type !== "CallExpression") {
    return;
  }
  const required = getRequireInfo(dec.init);
  if (!required) {
    return;
  }
  let object;
  if (dec.id.type === "ObjectPattern") {
    object = getObjectInfo(dec.id, true);
    if (!object) {
      return;
    }
  } else if (dec.id.type !== "Identifier") {
    return;
  }
  return {
    object,
    left: dec.id,
    right: dec.init,
    required
  };
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

function transformExportAssign({s, node}) {
  const exported = getExportInfo(node);
  if (!exported) {
    return;
  }
  if (exported.type === "named") {
    if (exported.value.type === "Identifier") {
      // exports.foo = foo
      s.overwrite(
        node.start,
        exported.value.start,
        "export {"
      );
      s.appendLeft(
        exported.value.end,
        exported.value.name === exported.name ?
          "}" : ` as ${exported.name}}`
      );
    } else {
      // exports.foo = "not an identifier"
      s.overwrite(
        node.start,
        exported.left.end,
        `const _export_${exported.name}_`
      );
      s.appendLeft(node.end, `;\nexport {_export_${exported.name}_ as ${exported.name}}`);
    }
  } else {
    if (exported.value.type !== "ObjectExpression") {
      // module.exports = ...
      s.overwrite(
        node.start,
        exported.value.start,
        "export default "
      );
    } else {
      // module.exports = {...}
      const objMap = getObjectInfo(exported.value);
      if (objMap) {
        const overwrite = (start, property, newLine, semi) => {
          if (property.value.type === "Identifier") {
            // foo: bar
            s.overwrite(start, property.value.start, `${newLine ? "\n" : ""}export {`);
            s.appendLeft(
              property.value.end,
              `${
                property.value.name === property.name ?
                  "" : ` as ${property.name}`
              }}${semi ? ";" : ""}`
            );
          } else {
            // foo: "not an identifier"
            s.overwrite(
              start,
              property.value.start,
              `${newLine ? "\n" : ""}const _export_${property.name}_ = ${
                property.method ?
                  `function${property.generator ? "*" : ""} ` : ""
              }`
            );
            s.appendLeft(
              property.value.end,
              `;\nexport {_export_${property.name}_ as ${property.name}}${semi ? ";" : ""}`
            );
          }
        };
        // module.exports = { ...
        let start = node.start;
        for (let i = 0; i < objMap.properties.length; i++) {
          overwrite(
            start,
            objMap.properties[i],
            i > 0,
            i < objMap.properties.length - 1
          );
          start = objMap.properties[i].value.end;
        }
        // , ... }
        s.remove(start, node.end);
      }
    }
  }
}

function transformExportDeclare({s, node}) {
  const declared = getDeclareExport(node);
  if (!declared) {
    return;
  }
  // const foo = exports.foo = ...
  s.overwrite(
    node.start,
    declared.exported.left.end,
    `export ${declared.kind} ${declared.exported.name}`
  );
}

function transformImportDeclare({s, node, code}) {
  const declared = getDeclareImport(node);
  if (!declared) {
    return;
  }
  if (!declared.object) {
    // const foo = require("foo")
    const rx = /.+\/\/.+\b(all|import\b.\ball)\b/y;
    rx.lastIndex = declared.required.end;
    if (rx.test(code)) {
      // import all
      s.overwrite(
        node.start,
        declared.left.start,
        "import * as "
      );
    } else {
      // import default
      s.overwrite(
        node.start,
        declared.left.start,
        "import "
      );
    }
  } else {
    // const {foo, bar}
    s.overwrite(
      node.start,
      declared.object.start,
      "import "
    );
    // foo: bar
    for (const prop of declared.object.properties) {
      if (prop.key.end < prop.value.start) {
        s.overwrite(
          prop.key.end,
          prop.value.start,
          " as "
        );
      }
    }
  }
  s.overwrite(
    declared.left.end,
    declared.required.start,
    " from "
  );
  s.remove(declared.required.end, declared.right.end);
}

function transform({parse, code}) {
  const s = new MagicString(code);
  let ast;
  try {
    ast = parse(code);
  } catch (err) {
    return;
  }
  walk(ast, {enter(node, parent) {
    // rewrite export
    if (node.type === "VariableDeclaration" && parent.type === "Program") {
      transformImportDeclare({s, node, code});
      transformExportDeclare({s, node});
    } else if (node.type === "AssignmentExpression" && parent.topLevel) {
      transformExportAssign({s, node});
    } else if (node.type === "ExpressionStatement" && parent.type === "Program") {
      node.topLevel = true;
    }
  }});
  return {code: s.toString()};
}

module.exports = {transform};
