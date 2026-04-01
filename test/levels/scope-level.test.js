"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { runAtLevel } = require("../helpers/level-runner.js");
const {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    comparableGtMerge,
} = require("../helpers/level-cases.js");

describe("levels / scope（继承传播、剪枝、覆盖消除与 predicate 差异）", () => {
    it("继承 predicate：矛盾仍折叠为 IMPOSSIBLE_SELECTOR", () => {
        const { query } = runAtLevel("scope", contradictorySameFieldInAnd);
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("继承 predicate：可比谓词合并与 predicate 一致", () => {
        const predicateQ = runAtLevel("predicate", comparableGtMerge).query;
        const scopeQ = runAtLevel("scope", comparableGtMerge).query;
        assert.deepStrictEqual(scopeQ, predicateQ);
    });

    it("继承约束：$and 兄弟约束传播后 $or 可收紧", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 1 }, { b: 1 }] }] };
        const pred = normalizeQuery(q, { level: "predicate" }).query;
        const scoped = normalizeQuery(q, { level: "scope" }).query;
        assert.ok(pred.$and);
        assert.deepStrictEqual(scoped, { a: 1 });
    });

    it("覆盖消除：重复 $eq 在 scope 下去冗余", () => {
        const q = { $and: [{ a: 1 }, { a: 1 }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("保守剪枝：与 inherited a:1 矛盾的 $or 分支去除", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
        const { query } = normalizeQuery(q, { level: "scope" });
        assert.ok(!JSON.stringify(query).includes('"a":2'));
    });

    it("与 predicate 差异：顶层 $or + 子矛盾时 scope 不额外改写（与 predicate 同形）", () => {
        const q = { $or: [{ a: 1 }, { $and: [{ b: 1 }, { b: 2 }] }] };
        const pred = normalizeQuery(q, { level: "predicate" }).query;
        const scoped = normalizeQuery(q, { level: "scope" }).query;
        assert.deepStrictEqual(scoped, pred);
    });
});
