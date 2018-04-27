/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const {parse} = require("acorn");
const {transform} = require("..");

const cases = [
  {
    name: "top-level only",
    test: dir => !dir.startsWith("hoist") && !dir.startsWith("dynamic"),
    options: {}
  }, {
    name: "top-level + hoist + dynamic",
    test: () => true,
    options: {dynamicImport: true, hoist: true}
  }
];

for (const c of cases) {
  describe(c.name, () => {
    for (const dir of fs.readdirSync(__dirname + "/cases")) {
      if (!c.test(dir)) {
        continue;
      }
      it(dir, () => {
        const readFile = filename => {
          try {
            const content = fs.readFileSync(`${__dirname}/cases/${dir}/${filename}`, "utf8").replace(/\r/g, "");
            if (filename.endsWith(".json")) {
              return JSON.parse(content);
            }
            return content;
          } catch (err) {
            // pass
          }
        };
        const options = readFile("options.json");
        const error = readFile("error.json");
        const input = readFile("input.js");
        const output = readFile("output.js");
        
        let result, err;
        try {
          result = transform(Object.assign({
            code: input,
            parse
          }, c.options, options));
        } catch (_err) {
          err = _err;
        }
        if (result) {
          assert.equal(result.code, output);
          assert.equal(result.isTouched, input !== output);
        } else {
          assert.equal(err.message, error.message);
        }
      });
    }
  });
}
