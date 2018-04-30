const {createContext} = require("./lib/context");
const {createAnalyzer} = require("./lib/analyzer");
const {createWriter} = require("./lib/writer");

function transform(options) {
  const context = createContext(options);
  const analyzer = createAnalyzer(context);

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
    return Promise.resolve({
      code: context.code,
      map: null,
      isTouched: false
    });
  }
  return createWriter(context).write()
    .then(() => ({
      code: context.s.toString(),
      map: options.sourceMap && context.s.generateMap(),
      isTouched: true
    }));
}

module.exports = {transform};
