"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");

describe("scope / impossible-branch-pruning", () => {
    it("inherited $eq 与分支 $eq 冲突时剪枝", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }] }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });
});
