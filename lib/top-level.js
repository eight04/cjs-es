const {getExportInfo, getRequireInfo, getObjectInfo, isPreferDefault} = require("./util");

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
    object,
    property,
    left: dec.id,
    right: dec.init,
    required
  };
}

function createTopLevelExportTransformer({s, exportStyle, code}) {
  let isTouched = false;
  
  return {
    transformExportAssign,
    transformExportDeclare,
    isTouched: () => isTouched
  };
  
  function transformExportAssign(node) {
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
    } else if (
      exported.value.type !== "ObjectExpression" ||
      !exported.value.properties.length ||
      exportStyle() === "default" ||
      isPreferDefault(code, exported.left)
    ) {
      // module.exports = ...
      s.overwrite(
        node.start,
        exported.value.start,
        "export default "
      );
    } else {
      // module.exports = {...}
      const objMap = getObjectInfo(exported.value);
      const overwrite = (start, property, newLine, semi) => {
        if (property.value.type === "Identifier") {
          // foo: bar
          s.overwrite(
            start,
            property.value.start,
            `${newLine ? "\n" : ""}export {`,
            {contentOnly: true}
          );
          s.appendLeft(
            property.value.end,
            `${
              property.value.name === property.name ?
                "" : ` as ${property.name}`
            }}${semi ? ";" : ""}`
          );
        } else {
          const required = property.value.type === "CallExpression" &&
            getRequireInfo(property.value);
          if (required) {
            // foo: require("...")
            s.prependRight(
              node.start,
              `import ${isPreferDefault(code, required) ? "" : "* as "}_export_${property.name}_ from ${JSON.stringify(required.value)};\n`
            );
            s.overwrite(
              start,
              property.key.start,
              `${newLine ? "\n" : ""}export {_export_${property.name}_ as `,
              {contentOnly: true}
            );
            s.overwrite(
              property.key.end,
              property.value.end,
              `}${semi?";":""}`
            );
            property.value.shouldSkip = true;
          } else {
            // foo: "not an identifier"
            s.overwrite(
              start,
              property.value.start,
              `${newLine ? "\n" : ""}const _export_${property.name}_ = ${
                property.method ?
                  `function${property.generator ? "*" : ""} ` : ""
              }`,
              {contentOnly: true}
            );
            s.appendLeft(
              property.value.end,
              `;\nexport {_export_${property.name}_ as ${property.name}}${semi ? ";" : ""}`
            );
          }
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
    isTouched = true;
    exported.left.shouldSkip = true;
  }

  function transformExportDeclare(node) {
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
    isTouched = true;
    node.declarations[0].shouldSkip = true;
  }
}

function createTopLevelImportTransformer({s, importStyle, code, hoist}) {
  let isTouched = false;
  
  return {
    transformImportBare,
    transformImportDeclare,
    isTouched: () => isTouched
  };
  
  function transformImportDeclare(node) {
    const declared = getDeclareImport(node);
    if (!declared) {
      return;
    }
    const preferDefault = isPreferDefault(code, declared.required) ||
        importStyle(declared.required.value) === "default";
    if (declared.property) {
      // const foo = require("foo").foo;
      s.overwrite(
        node.start,
        declared.left.start,
        `import {${declared.property.name !== declared.left.name ? `${declared.property.name} as ` : ""}`
      );
      s.appendLeft(declared.left.end, "}");
    } else if (!declared.object) {
      // const foo = require("foo")
      if (preferDefault) {
        // import default
        s.overwrite(
          node.start,
          declared.left.start,
          "import "
        );
      } else {
        // import named
        s.overwrite(
          node.start,
          declared.left.start,
          "import * as "
        );
      }
    } else {
      if (preferDefault) {
        if (hoist) {
          return;
        } else {
          throw new Error("Can not bind default export to ObjectPattern.");
        }
      }
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
    isTouched = true;
    node.declarations[0].shouldSkip = true;
  }

  function transformImportBare(node) {
    const required = getRequireInfo(node);
    if (required) {
      s.overwrite(node.start, required.start, "import ");
      s.remove(required.end, node.end);
      isTouched = true;
      node.shouldSkip = true;
    }
  }
}

module.exports = {
  createTopLevelExportTransformer,
  createTopLevelImportTransformer
};
