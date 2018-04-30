const MagicString = require("magic-string");
const {createImportWriter} = require("./import-writer");
const {createExportWriter} = require("./export-writer");

function createWriter(context) {
  context.s = new MagicString(context.code);
  return {write};
  
  function write() {
    return Promise.all([
      createImportWriter(context).write(),
      createExportWriter(context).write()
    ]);
  }
}

module.exports = {createWriter};
