/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const {parse} = require("acorn");
const {transform} = require("..");

describe("cases", () => {
  for (const dir of fs.readdirSync(__dirname + "/cases")) {
    it(dir, () => {
      const readFile = filename => {
        try {
          return fs.readFileSync(`${__dirname}/cases/${dir}/${filename}`, "utf8").replace(/\r/g, "");
        } catch (err) {
          // pass
        }
      };
      const options = JSON.parse(readFile("options.json") || "{}");
      const input = readFile("input.js");
      const output = readFile("output.js");
      
      const actual = transform(Object.assign({code: input, parse}, options)).code;
      assert.equal(actual, output);
    });
  }
});
