"use strict";

const assert = require("node:assert/strict");
const { runAtLevel } = require("../helpers/level-runner.js");
const {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    duplicateLogicalChildren,
    duplicateOrBranches,
    singleChildAnd,
    singleChildOr,
    nestedAndFlatten,
    andWrappingOr,
    comparableGtMerge,
    commonPredicatesInOr,
} = require("../helpers/level-cases.js");

describe("levels / shape", () => {
    it("单子节点 $and 折叠为内层查询", () => {
        const { query } = runAtLevel("shape", singleChildAnd);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("单子节点 $or 折叠为内层查询", () => {
        const { query } = runAtLevel("shape", singleChildOr);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("$and 下重复 compound（$and/$or）子句去重", () => {
        const { query } = runAtLevel("shape", duplicateLogicalChildren);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("$or 下重复分支去重", () => {
        const { query } = runAtLevel("shape", duplicateOrBranches);
        assert.deepStrictEqual(query, { a: 1 });
    });

    it("嵌套 $and 展平为单层 compound 树", () => {
        const { query } = runAtLevel("shape", nestedAndFlatten);
        assert.deepStrictEqual(query, { $and: [{ a: 1 }, { b: 2 }] });
    });

    it("单子节点 $and 仅包裹 $or 时上提 $or", () => {
        const { query } = runAtLevel("shape", andWrappingOr);
        assert.deepStrictEqual(query, { $or: [{ a: 1 }, { b: 2 }] });
    });

    it("禁止能力：不做同字段矛盾折叠为 IMPOSSIBLE_SELECTOR", () => {
        const { query } = runAtLevel("shape", contradictorySameFieldInAnd);
        assert.notDeepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("禁止能力：不做 $or 公共谓词 detect / hoist（无 warning）", () => {
        const { query, meta } = runAtLevel("shape", commonPredicatesInOr, {
            observe: { collectWarnings: true },
        });
        assert.ok(Array.isArray(query.$or));
        assert.equal(meta.warnings.length, 0);
    });

    it("与 predicate 对照：可比范围谓词在 shape 层不合并", () => {
        const shapeQuery = runAtLevel("shape", comparableGtMerge).query;
        const predicateQuery = runAtLevel("predicate", comparableGtMerge).query;
        assert.notDeepStrictEqual(shapeQuery, predicateQuery);
        assert.ok(Array.isArray(shapeQuery.$and));
        assert.equal(shapeQuery.$and.length, 2);
        assert.deepStrictEqual(predicateQuery, { a: { $gt: 5 } });
    });
});
