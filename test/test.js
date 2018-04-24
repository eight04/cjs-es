/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const {parse} = require("acorn");
const {transform} = require("..");

describe("cases", () => {
  for (const dir of fs.readdirSync(__dirname + "/cases")) {
    it(dir, () => {
      const input = fs.readFileSync(`${__dirname}/cases/${dir}/input.js`, "utf8").replace(/\r/g, "");
      const output = fs.readFileSync(`${__dirname}/cases/${dir}/output.js`, "utf8").replace(/\r/g, "");
      
      const actual = transform({code: input, parse}).code;
      assert.equal(actual, output);
    });
  }
});
