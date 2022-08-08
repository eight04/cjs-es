const {createContext} = require("./lib/context");
const {createAnalyzer} = require("./lib/analyzer");
const {createWriter} = require("./lib/writer");

async function transform(options) {
  const context = createContext(options);
  const analyzer = await createAnalyzer(context);

  try {
    analyzer.analyze();
  } catch (err) {
    if (err.pos == null && context.node) {
      err.pos = context.node.start;
    }
    throw err;
  }
  if (
    !context.moduleNodes.length &&
    !context.requireNodes.length &&
    !context.exportsNodes.length
  ) {
    return {
      code: context.code,
      map: null,
      isTouched: false
    };
  }
  await createWriter(context).write();
  return {
    code: context.s.toString(),
    map: options.sourceMap && context.s.generateMap({hires: true}),
    isTouched: true,
    context: context
  };
}

module.exports = {transform};
