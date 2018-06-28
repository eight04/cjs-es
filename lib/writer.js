const MagicString = require("magic-string");
const {createImportWriter} = require("./import-writer");
const {createExportWriter} = require("./export-writer");

function createWriter(context) {
  context.s = new MagicString(context.code);
  context.safeOverwrite = (start, end, text) => {
    if (start !== end) {
      context.s.overwrite(start, end, text);
    } else {
      context.s.appendLeft(start, text);
    }
  };
  return {write};
  
  function write() {
    return Promise.all([
      createImportWriter(context).write(),
      createExportWriter(context).write()
    ]);
  }
}

module.exports = {createWriter};
