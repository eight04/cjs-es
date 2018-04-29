function createWriter(context) {
  context.s = new MagicString(options.code);
  context.isTouched = false;
  return {write};
  
  function write() {
    return Promise.all(
      createImportWriter(context).write(),
      createExportWriter(context).write()
    );
  }
}

module.exports = {createWriter};
