"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("scope / covered-local-constraint-removal", () => {
    it("父 $eq 已覆盖时子句 $eq 可去冗余", () => {
        const q = { $and: [{ a: 1 }, { a: 1 }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, { a: 1 });
    });
});
