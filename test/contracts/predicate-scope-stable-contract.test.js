"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    comparableGtMerge,
    literalAndExplicitEq,
    commonPredicatesInOr,
} = require("../helpers/level-cases.js");

const LEVELS_PS = ["predicate", "scope"];

function assertIdempotent(query, level, options = {}) {
    const once = normalizeQuery(query, { level, ...options });
    const twice = normalizeQuery(once.query, { level, ...options });
    assert.deepStrictEqual(twice.query, once.query);
    assert.equal(twice.meta.bailedOut, once.meta.bailedOut);
}

describe("contracts / predicate & scope 稳定语义（contract）", () => {
    describe("稳定支持的模式", () => {
        it("predicate：同字段可比下界合并", () => {
            const { query } = normalizeQuery(comparableGtMerge, { level: "predicate" });
            assert.deepStrictEqual(query, { a: { $gt: 5 } });
        });

        it("predicate：字面量与 $eq 收敛", () => {
            const { query } = normalizeQuery(literalAndExplicitEq, { level: "predicate" });
            assert.deepStrictEqual(query, { a: 1 });
        });

        it("predicate / scope：矛盾折叠为 IMPOSSIBLE_SELECTOR", () => {
            for (const level of LEVELS_PS) {
                const { query } = normalizeQuery(contradictorySameFieldInAnd, { level });
                assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
            }
        });

        it("scope：结构化改写与 predicate 一致（含 $or 公共谓词检测不改写 query）", () => {
            const p = normalizeQuery(commonPredicatesInOr, { level: "predicate" }).query;
            const s = normalizeQuery(commonPredicatesInOr, { level: "scope" }).query;
            assert.deepStrictEqual(s, p);
        });
    });

    describe("不支持算子：保守保留", () => {
        const opaqueQuery = { status: { $regex: "^x", $options: "i" } };

        for (const level of LEVELS_PS) {
            it(`${level}：$regex 子树保留且可二次 normalize`, () => {
                const { query } = normalizeQuery(opaqueQuery, { level });
                assert.deepStrictEqual(query.status, opaqueQuery.status);
                assertIdempotent(opaqueQuery, level);
            });
        }
    });

    describe("幂等", () => {
        for (const level of LEVELS_PS) {
            it(`${level}：典型查询二次 normalize 输出不变`, () => {
                assertIdempotent({ $and: [{ a: 5 }, { b: { $gte: 1, $lte: 10 } }] }, level);
                assertIdempotent({ $or: [{ x: 1 }, { y: 2 }] }, level);
            });
        }
    });

    describe("scope 改写护栏（safetyPolicy）", () => {
        it("allowBranchPruning: false 时保留默认会被剪掉的 $or 分支", () => {
            const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
            const pruned = normalizeQuery(q, { level: "scope" }).query;
            assert.ok(!JSON.stringify(pruned).includes('"a":2'));

            const preserved = normalizeQuery(q, {
                level: "scope",
                scope: { safetyPolicy: { allowBranchPruning: false } },
            }).query;
            assert.ok(JSON.stringify(preserved).includes('"a":2'));
        });

        it("护栏下幂等仍成立", () => {
            const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
            const opts = { level: "scope", scope: { safetyPolicy: { allowBranchPruning: false } } };
            assertIdempotent(q, "scope", opts);
        });
    });

    describe("skip / 规则开关一致性", () => {
        it("scope 关闭 detectCommonPredicatesInOr 时不应 applied 该规则", () => {
            const detectRuleId = "orCommonPredicate.detectCommonPredicatesInOr";
            const withDetect = normalizeQuery(commonPredicatesInOr, {
                level: "scope",
                rules: { detectCommonPredicatesInOr: true },
            });
            assert.ok(withDetect.meta.appliedRules.includes(detectRuleId));

            const withoutDetect = normalizeQuery(commonPredicatesInOr, {
                level: "scope",
                rules: { detectCommonPredicatesInOr: false },
            });
            assert.ok(!withoutDetect.meta.appliedRules.includes(detectRuleId));
        });
    });
});
