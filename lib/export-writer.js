function createExportWriter(context) {
  context.defaultExports = [];
  context.namedExports = new Map;
  context.objectExports = new Map;
  context.finalExportType = null;
  return {write};
  
  function write() {
    if (!context.moduleNodes.length && !context.exportsNodes.length) {
      return;
    }
    // passing module around
    if (context.moduleNodes.some(n => !n.exported && !n.nestedExports && !n.declared)) {
      return bindToSingleModule();
    }
    for (const node of context.moduleNodes.concat(context.exportsNodes)) {
      const name = node.exported && node.exported.name ||
        node.declared && node.declared.exported.name ||
        node.nestedExports && node.nestedExports.name;
      // console.log(name);
      if (!name) {
        context.defaultExports.push(node);
        continue;
      }
      let nodes = context.namedExports.get(name);
      if (!nodes) {
        nodes = [];
        context.namedExports.set(name, nodes);
      }
      nodes.push(node);
    }
    
    // export object literal?
    if (isObjectMapExport()) {
      const node = context.defaultExports[0];
      const {properties} = node.exported.object;
      let start = node.exported.leftMost.start;
      let nameInfo;
      for (let i = 0; i < properties.length; i++) {
        properties[i].rootPos = node.rootPos;
        nameInfo = {
          type: "objectProperty",
          start,
          node: properties[i],
          newLine: i > 0
        };
        const name = properties[i].key.name;
        let infos = context.objectExports.get(name);
        if (!infos) {
          infos = [];
          context.objectExports.set(name, infos);
        }
        infos.push(nameInfo);
        start = properties[i].value.end;
      }
      nameInfo.trim = [start, node.exported.statement.end];
    }
    
    // sometimes it's impossible to use named exports
    if (
      context.defaultExports.length > 1 ||
      context.defaultExports.length === 1 && (
        !isObjectMapExport() ||
        context.hasDefaultComment(context.defaultExports[0])
      )
    ) {
      return bindToSingleExport();
    }
    // export named
    return Promise.resolve(context.isExportPreferDefault())
      .then(preferDefault => {
        if (preferDefault) {
          return bindToSingleExport();
        }
        return bindToNames();
      });
  }
  
  function isSingleLineExport() {
    if (context.defaultExports.length !== 1) {
      return false;
    }
    const node = context.defaultExports[0];
    return node.exported && node.exported.statement || node.declared;
  }
  
  function isObjectMapExport() {
    if (!isSingleLineExport()) {
      return false;
    }
    const node = context.defaultExports[0];
    if (node.declared || !node.exported.object) {
      // bind to a single reference
      return false;
    }
    const props = node.exported.object.properties;
    if (props.some(p => p.value.containThis)) {
      return false;
    }
    // some names are not exported in the object
    // FIXME: is this the correct behavior?
    const keys = new Set(props.map(p => p.key.name));
    for (const k of context.namedExports.keys()) {
      if (!keys.has(k)) {
        return false;
      }
    }
    return true;
  }
  
  function bindToSingleModule() {
    if (
      context.moduleNodes.length &&
      context.exportsNodes.length &&
      context.exportsNodes[0].rootPos > context.moduleNodes[0].rootPos
    ) {
      context.exportsNodes[0].rootPos = context.moduleNodes[0].rootPos;
    }
    if (context.exportsNodes.length) {
      context.s.appendLeft(
        context.exportsNodes[0].rootPos,
        "let _exports_ = {};\n"
      );
    }
    if (context.moduleNodes.length) {
      context.s.appendLeft(
        context.moduleNodes[0].rootPos,
        `const _module_ = {exports: ${context.exportsNodes.length ? "_exports_" : "{}"}};\n`
      );
    }
    for (const node of context.moduleNodes) {
      context.s.overwrite(node.start, node.end, "_module_", {contentOnly: true});
    }
    for (const node of context.exportsNodes) {
      context.s.overwrite(node.start, node.end, "_exports_", {contentOnly: true});
    }
    if (context.moduleNodes.length) {
      context.s.appendLeft(
        context.topLevel.get().end,
        "\nexport default _module_.exports;"
      );
    } else {
      context.s.appendLeft(
        context.topLevel.get().end,
        "\nexport {_exports_ as default};"
      );
    }
    context.finalExportType = "default";
  }
  
  function bindToSingleLineExport() {
    const node = context.defaultExports[0];
    if (node.declared) {
      // const foo = module.exports = ...
      context.s.overwrite(
        node.declared.id.end,
        node.declared.exported.value.start,
        " = "
      );
      context.s.remove(
        node.declared.exported.value.end,
        node.declared.end
      );
      context.s.appendLeft(
        node.declared.end,
        `;\nexport {${node.declared.id.name} as default};`
      );
    } else {
      // module.exports = ...
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        "export default "
      );
      if (
        node.exported.value.type === "FunctionExpression" ||
        node.exported.value.type === "ClassExpression"
      ) {
        // convert declaration into expression
        if (node.exported.value.id) {
          context.s.appendLeft(node.exported.value.start, "(");
          context.safeOverwrite(node.exported.value.end, node.exported.statement.end, ");");
        } else {
          context.s.remove(node.exported.value.end, node.exported.statement.end);
        }
      } else {
        context.safeOverwrite(node.exported.value.end, node.exported.statement.end, ";");
      }
      if (node.exported.isIife && context.code[node.exported.value.start] !== "(") {
        // wrap iife expression
        context.s.appendRight(node.exported.value.callee.start, "(");
        context.s.appendLeft(node.exported.value.callee.end, ")");
      }
    }
    context.finalExportType = "default";
  }
  
  function writeProperty({
    start,
    node: property,
    newLine,
    assignOnly = false,
    shareExport = false,
    kind = "const",
    trim
  }) {
    if (newLine) {
      context.s.appendLeft(start, "\n");
    }
    const valuePrefix = property.method ? `function${property.generator ? "*" : ""} ` : "";
    if (assignOnly) {
      context.s.overwrite(
        start,
        property.value.start,
        `_export_${property.key.name}_ = ${valuePrefix}`,
        {contentOnly: true}
      );
    } else if (!shareExport && (property.value.type === "Identifier" || property.required)) {
      // foo: bar
      context.s.overwrite(
        start,
        property.value.start,
        "export {",
        {contentOnly: true} // don't overwrite previous };
      );
      context.s.appendLeft(
        property.value.end,
        `${property.key.name !== property.value.name ? ` as ${property.key.name}` : ""}}`
      );
    } else {
      // foo: "not an identifier"
      context.s.overwrite(
        start,
        property.value.start,
        `${kind} _export_${property.key.name}_ = ${valuePrefix}`,
        {contentOnly: true}
      );
      context.s.appendLeft(
        property.value.end,
        `;\nexport {_export_${property.key.name}_ as ${property.key.name}}`
      );
    }
    context.s.appendLeft(property.value.end, ";");
    if (trim) {
      context.s.remove(trim[0], trim[1]);
    }
  }
  
  function bindToNames() {
    // merge namedExports and objectExports
    const allExports = new Map;
    for (const [name, nodes] of context.namedExports) {
      if (!allExports.has(name)) {
        allExports.set(name, []);
      }
      allExports.get(name).push(...nodes.map(n => ({node: n, type: "name"})));
    }
    for (const [name, infos] of context.objectExports) {
      if (!allExports.has(name)) {
        allExports.set(name, []);
      }
      allExports.get(name).push(...infos);
    }
      
    // names
    for (const [name, infos] of allExports) {
      let init = 0;
      let assignment = 0;
      // let declared = 0;
      for (const info of infos) {
        if (info.type === "name") {
          const node = info.node;
          if (node.declared) {
            // declared++;
            init++;
            assignment++;
          } else if (node.exported) {
            if (node.exported.statement) {
              init++;
            }
            assignment++;
          } else if (node.nestedExports.node.isAssignment) {
            assignment++;
          }
        } else {
          init++;
          assignment++;
        }
      }
      // FIXME: find a way to detect if the init is the first access to the variable?
      if (init === 1 && infos.length === 1) {
        for (const info of infos) {
          if (info.type === "name") {
            const node = info.node;
            if (node.declared) {
              writeNamedDeclare(node);
            } else if (node.exported && node.exported.statement) {
              writeNamedExports(node, assignment > 1 ? "let" : "const", infos.length > 1);
            } else {
              writeNestedExports(node);
            }
          } else {
            info.kind = assignment > 1 ? "let" : "const";
            info.shareExport = infos.length > 1;
            writeProperty(info);
          }
        }
      } else {
        for (const info of infos) {
          if (info.type === "name") {
            const node = info.node;
            if (node.declared) {
              node.exported = node.declared.exported;
            }
            writeNestedExports(node);
          } else {
            info.assignOnly = true;
            writeProperty(info);
          }
        }
        const poses = infos.map(i => i.node.rootPos);
        writeNamedInit(Math.min(...poses), name);
      }
    }
    context.finalExportType = "named";
  }
  
  function writeNamedDeclare(node) {
    if (node.declared.id.name === node.declared.exported.name) {
      context.s.overwrite(
        node.declared.start,
        node.declared.exported.key.start,
        `export ${node.declared.kind} `
      );
    } else {
      context.s.overwrite(
        node.declared.id.end,
        node.declared.exported.value.start,
        " = "
      );
      context.s.remove(
        node.declared.exported.value.end,
        node.declared.end
      );
      context.s.appendLeft(
        node.declared.end,
        `;\nexport {${node.declared.id.name} as ${node.declared.exported.name}};`
      );
    }
  }
  
  function writeNamedExports(node, kind = "const", shareExport = false) {
    if (node.exported.value.type !== "Identifier" && !node.exported.required || shareExport) {
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        `${kind} _export_${node.exported.name}_ = `,
        {contentOnly: true}
      );
      context.safeOverwrite(
        node.exported.value.end,
        node.exported.statement.end,
        `;\nexport {_export_${node.exported.name}_ as ${node.exported.name}};`
      );
    } else {
      context.s.overwrite(
        node.exported.leftMost.start,
        node.exported.value.start,
        "export {",
        {contentOnly: true}
      );
      context.safeOverwrite(
        node.exported.value.end,
        node.exported.statement.end,
        `${node.exported.value.name !== node.exported.name ? ` as ${node.exported.name}` : ""}};`
      );
    }
  }
  
  function writeNestedExports(node) {
    const target = node.nestedExports || node.exported;
    context.s.overwrite(
      target.node.start,
      target.node.end,
      `_export_${target.name}_`,
      {contentOnly: true}
    );
  }
  
  function writeNamedInit(node, name) {
    context.s.appendLeft(
      node.rootPos,
      `let _export_${name}_;\nexport {_export_${name}_ as ${name}};\n`
    );
  }
  
  function bindToSingleExport() {
    if (isSingleLineExport() && !context.namedExports.size) {
      return bindToSingleLineExport();
    }
    const nodes = context.moduleNodes.concat(context.exportsNodes);
    let init = 0;
    let assignment = 0;
    let childAssignment = 0;
    for (const node of nodes) {
      if (node.exported) {
        if (node.exported.name) {
          continue;
        }
        if (node.exported.statement) {
          init++;
        }
        if (!node.parentAssign) {
          assignment++;
        } else {
          childAssignment++;
        }
      } else if (
        node.nestedExports && node.nestedExports.node.isAssignment ||
        node.isAssignment
      ) {
        assignment++;
      }
    }
    // FIXME: find a way to detect whether the init statement is the first access to the variable
    // so we can also use writeDefaultExportDeclare when nodes.length > 1
    // https://github.com/eight04/cjs-es/issues/28
    if (init === 1 && nodes.length === 1) {
      for (const node of nodes) {
        if (node.exported && node.exported.statement && !node.exported.name) {
          writeDefaultExportDeclare(node, assignment === 1 ? "const" : "let");
        } else {
          writeDefaultExportNode(node);
        }
      }
    } else {
      // NOTE: we can't actually use topIndex... the script may access _module_exports_ indirectly through function call.
      // const topIndex = nodes.reduce(
      //   (r, n) => n.rootPos < r ? n.rootPos : r,
      //   Infinity
      // );
      const kind = assignment ? "let" : "const";
      const defaultValue = assignment + childAssignment === nodes.length && !context.needDefaultObject ? "" : " = {}";
      context.s.appendLeft(
        0,
        `${kind} _module_exports_${defaultValue};\nexport {_module_exports_ as default};\n`
      );
      for (const node of nodes) {
        writeDefaultExportNode(node);
      }
    }
    context.finalExportType = "default";
  }
  
  function writeDefaultExportDeclare(node, kind) {
    const target = node.childAssign || node;
    context.s.overwrite(
      node.exported.node.start,
      target.exported.assignExpression.left.end,
      `${kind} _module_exports_`,
      {contentOnly: true}
    );
    context.s.appendLeft(node.exported.statement.end, "\nexport {_module_exports_ as default};");
  }
  
  function writeDefaultExportNode(node) {
    if (node.parentAssign && node.parentAssign.childAssign) {
      return; // ignore module.exports = exports = ...
    }
    let start, end;
    if (node.childAssign) {
      start = node.start;
      end = node.childAssign.exported.assignExpression.left.end;
    } else {
      const exported = node.exported || node.nestedExports;
      const target = exported ?
        (exported.name ? exported.node.object : exported.node) :
        node;
      start = target.start;
      end = target.end;
    }
    context.s.overwrite(start, end, "_module_exports_", {contentOnly: true});
  }
}

module.exports = {createExportWriter};
