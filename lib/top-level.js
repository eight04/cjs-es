const {getExportInfo, getRequireInfo, getObjectInfo, hasDefaultComment} = require("./util");

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

function createTopLevelExportTransformer({s, importStyle, exportStyle, code, hoist}) {
  let isTouched = false;
  const exportAssign = [];
  const exportDeclare = [];
  
  return {
    transformExportAssign,
    transformExportDeclare,
    writeExport,
    isTouched: () => isTouched
  };
  
  function writeExport() {
    exportAssign.forEach(args => writeExportAssign(...args));
    exportDeclare.forEach(args => writeExportDeclare(...args));
  }
  
  function transformExportAssign(node) {
    const exported = getExportInfo(node);
    if (!exported) {
      return;
    }
    exported.leftMost.isTopLevelExport = true;
    exported.leftMost.isNamedExport = exported.isNamed;
    if (exported.object) {
      const preferDefault =
        exportStyle() === "default" || hasDefaultComment(code, exported.left);
      exported.preferDefault = preferDefault;
      if (!preferDefault) {
        for (const required of exported.object.requires) {
          required.node.isTopLevelImport = true;
        }
      }
    } else {
      exported.preferDefault = exportStyle() === "default";
    }
    exportAssign.push([node, exported]);
  }
  
  function writeExportAssign(node, exported) {
    if (exported.isNamed) {
      if (exported.preferDefault) {
        if (hoist) {
          // let hoist transformer take over.
          return;
        } else {
          const err = new Error("Can not collect named exports to a single object without hoist transformer");
          err.node = node;
          throw err;
        }
      }
    } else if (!exported.object || exported.preferDefault) {
      // module.exports = ...
      s.overwrite(
        node.start,
        exported.value.start,
        "export default ",
        {contentOnly: true}
      );
    } else {
      // module.exports = {...}
      const overwrite = (start, property, newLine, semi) => {
      };
      // module.exports = { ...
    }
    isTouched = true;
  }

  function transformExportDeclare(node) {
    const declared = getDeclareExport(node);
    if (!declared) {
      return;
    }
    declared.exported.leftMost.isTopLevelExport = true;
    exportDeclare.push([node, declared]);
  }
  
  function writeExportDeclare(node, declared) {
    // const foo = exports.foo = ...
    s.overwrite(
      node.start,
      declared.exported.left.end,
      `export ${declared.kind} ${declared.exported.name}`,
      {contentOnly: true}
    );
    isTouched = true;
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
    const preferDefault = hasDefaultComment(code, declared.required) ||
        importStyle(declared.required.value) === "default";

    isTouched = true;
    node.declarations[0].shouldSkip = true;
  }

  function transformImportBare(node) {
    const required = getRequireInfo(node);
    if (required) {
      s.overwrite(node.start, required.start, "import ");
      s.remove(required.end, node.end);
      isTouched = true;
      node.isBareImport = true;
    }
  }
}

module.exports = {
  createTopLevelExportTransformer,
  createTopLevelImportTransformer
};
