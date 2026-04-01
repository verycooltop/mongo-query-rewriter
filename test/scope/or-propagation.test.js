"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");

describe("scope / or-propagation", () => {
    it("根约束进入 $or 各分支：矛盾分支被剪掉", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, { $and: [{ a: 1 }, { b: 1 }] });
    });

    it("无外层约束时顶层 $or 保持（与 predicate 一致）", () => {
        const q = { $or: [{ a: 1 }, { b: 2 }] };
        const p = normalizeQuery(q, { level: "predicate" }).query;
        const s = normalizeQuery(q, { level: "scope" }).query;
        assert.deepStrictEqual(s, p);
    });
});
