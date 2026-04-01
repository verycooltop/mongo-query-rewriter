"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("scope / unsupported-scope-mix", () => {
    it("顶层 $or 含复杂子树时保守保留", () => {
        const q = { $or: [{ a: 1 }, { $and: [{ b: 1 }, { b: 2 }] }] };
        const pred = normalizeQuery(q, { level: "predicate" }).query;
        const scoped = normalizeQuery(q, { level: "scope" }).query;
        assert.deepStrictEqual(scoped, pred);
    });
});
