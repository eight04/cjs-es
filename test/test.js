/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const {parse} = require("acorn");
const {transform} = require("..");

const cases = [
  {
    name: "top-level only",
    test: dir => !dir.startsWith("nested") && !dir.startsWith("dynamic"),
    options: {}
  }, {
    name: "all cases",
    test: () => true,
    options: {nested: true}
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
        const requireFile = filename => {
          try {
            return require(`${__dirname}/cases/${dir}/${filename}`);
          } catch (err) {
            // pass
          }
        };
        const options = readFile("options.json") || requireFile("options.js") || {};
        const error = readFile("error.json");
        const input = readFile("input.js");
        const output = readFile("output.js");
        
        return transform(
          Object.assign({
            code: input,
            parse,
            warn(message, pos) {
              throw new Error(`Unexpected warning: ${message}, at ${pos}`);
            }
          }, c.options, options)
        )
          .then(
            result => {
              if (error) {
                throw new Error("Unexpected result");
              }
              assert.equal(result.code, output);
              assert.equal(result.isTouched, input !== output);
            },
            err => {
              if (!error) {
                throw err;
              }
              assert.equal(err.message, error.message);
            }
          )
          .then(() => {
            if (options.onEnd) {
              options.onEnd();
            }
          });
      });
    }
  });
}
