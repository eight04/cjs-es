/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const sinon = require("sinon"); // eslint-disable-line
const {parse} = require("acorn");
const {transform} = require("..");

const cases = [
  {
    name: "top-level only",
    test: dir => !dir.startsWith("nested") && !dir.startsWith("dynamic"),
    options: {}
  }, {
    name: "nested",
    test: dir => !dir.endsWith("no-nested"),
    options: {nested: true}
  }, {
    name: "work without semi",
    test: dir => !dir.endsWith("no-nested"),
    options: {nested: true},
    removeSemi: true
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
        const tryRemoveSemi = (s) => {
          if (c.removeSemi) {
            s = s.replace(/;/g, "");
          }
          return s;
        };
        const options = readFile("options.json") || requireFile("options.js") || {};
        const error = readFile("error.json");
        const input = tryRemoveSemi(readFile("input.js"));
        const output = readFile("output.js");
        let result;
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
            _result => {
              result = _result;
              if (error) {
                throw new Error("Unexpected result");
              }
              if (c.removeSemi) {
                return;
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
              options.onEnd(result);
            }
          });
      });
    }
  });
}
