const {getDynamicImport} = require("./util");

function createDynamicImportTransformer({s, scope}) {
  let isTouched = false;
  
  return {
    transform,
    isTouched: () => isTouched
  };
  
  function transform(node) {
    // CallExpression
    const imported = getDynamicImport(node);
    if (!imported || scope.has("require")) {
      return;
    }
    s.overwrite(
      imported.start,
      imported.required.start,
      "import("
    );
    s.overwrite(
      imported.required.end,
      imported.end,
      ")"
    );
    isTouched = true;
    node.arguments[0].shouldSkip = true;
  }
}

module.exports = {createDynamicImportTransformer};
