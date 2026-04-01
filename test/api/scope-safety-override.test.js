"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("api / scope safetyPolicy override", () => {
    it("allowBranchPruning: false 时保留矛盾 $or 分支（默认会剪掉不可满足分支并收紧 $or）", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
        const pruned = normalizeQuery(q, { level: "scope" }).query;
        assert.ok(!JSON.stringify(pruned).includes('"a":2'));

        const preserved = normalizeQuery(q, {
            level: "scope",
            scope: { safetyPolicy: { allowBranchPruning: false } },
        }).query;
        assert.ok(JSON.stringify(preserved).includes('"a":2'));
        assert.ok(preserved.$and);
    });
});
