"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("scope / single-branch-collapse", () => {
    it("$or 只剩一分支时折叠", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ b: 1 }] }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, { $and: [{ a: 1 }, { b: 1 }] });
    });
});
