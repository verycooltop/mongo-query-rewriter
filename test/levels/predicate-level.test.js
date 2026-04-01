"use strict";

const assert = require("node:assert/strict");
const { runAtLevel } = require("../helpers/level-runner.js");
const {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    singleChildAnd,
    nestedAndFlatten,
    comparableGtMerge,
    inOverlapMerge,
    literalAndExplicitEq,
    commonPredicatesInOr,
} = require("../helpers/level-cases.js");

describe("levels / predicate", () => {
    it("继承 shape：单子节点 $and 折叠", () => {
        const { query } = runAtLevel("predicate", singleChildAnd);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("继承 shape：嵌套 $and 展平", () => {
        const shapeQ = runAtLevel("shape", nestedAndFlatten).query;
        const predicateQ = runAtLevel("predicate", nestedAndFlatten).query;
        assert.deepStrictEqual(predicateQ, shapeQ);
    });

    it("正向能力：同字段矛盾折叠为 IMPOSSIBLE_SELECTOR", () => {
        const { query } = runAtLevel("predicate", contradictorySameFieldInAnd);
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("正向能力：同字段多个 $gt 合并为更紧下界", () => {
        const { query } = runAtLevel("predicate", comparableGtMerge);
        assert.deepStrictEqual(query, { a: { $gt: 5 } });
    });

    it("正向能力：同字段 $in 在 $and 内合并为单字段（与 shape 结构不同）", () => {
        const shapeQuery = runAtLevel("shape", inOverlapMerge).query;
        const predicateQuery = runAtLevel("predicate", inOverlapMerge).query;
        assert.ok(Array.isArray(shapeQuery.$and));
        assert.equal(shapeQuery.$and.length, 2);
        assert.equal(predicateQuery.$and, undefined);
        assert.ok(predicateQuery.a && Array.isArray(predicateQuery.a.$in));
    });

    it("正向能力：字面量与显式 $eq 收敛为单一字段条件", () => {
        const { query } = runAtLevel("predicate", literalAndExplicitEq);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("禁止能力：不做 $or 公共谓词改写（与 shape 输出一致）", () => {
        const shapeQuery = runAtLevel("shape", commonPredicatesInOr).query;
        const predicateQuery = runAtLevel("predicate", commonPredicatesInOr).query;
        assert.deepStrictEqual(predicateQuery, shapeQuery);
        assert.ok(Array.isArray(predicateQuery.$or));
    });

    it("与 scope 对照：同一 $or 用例下 query 与 predicate 相同（scope 仅多观测）", () => {
        const predicateQuery = runAtLevel("predicate", commonPredicatesInOr).query;
        const scopeQuery = runAtLevel("scope", commonPredicatesInOr).query;
        assert.deepStrictEqual(scopeQuery, predicateQuery);
        const observe = { collectWarnings: true };
        const pw = runAtLevel("predicate", commonPredicatesInOr, { observe }).meta.warnings.length;
        const sw = runAtLevel("scope", commonPredicatesInOr, { observe }).meta.warnings.length;
        assert.ok(sw > pw);
    });
});
