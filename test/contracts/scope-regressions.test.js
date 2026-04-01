"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery, resolveNormalizeOptions } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");
const { contradictorySameFieldInAnd, commonPredicatesInOr } = require("../helpers/level-cases.js");

describe("contracts / scope 与 surface 回归", () => {
    it("resolveNormalizeOptions：不再接受 allowNorPropagation（运行时 unknown 字段不并入 safetyPolicy）", () => {
        const r = resolveNormalizeOptions({
            scope: { safetyPolicy: { allowBranchPruning: false, allowNorPropagation: true } },
        });
        assert.equal(r.scope.safetyPolicy.allowBranchPruning, false);
        assert.equal(Object.prototype.hasOwnProperty.call(r.scope.safetyPolicy, "allowNorPropagation"), false);
    });

    it("IMPOSSIBLE_SELECTOR：二次 normalize（predicate）稳定", () => {
        const once = normalizeQuery(contradictorySameFieldInAnd, { level: "predicate" });
        assert.deepStrictEqual(once.query, IMPOSSIBLE_SELECTOR);
        const twice = normalizeQuery(once.query, { level: "predicate" });
        assert.deepStrictEqual(twice.query, IMPOSSIBLE_SELECTOR);
    });

    it("parse → normalize → compile → normalize：矛盾查询幂等", () => {
        const first = normalizeQuery(contradictorySameFieldInAnd, { level: "predicate" });
        const second = normalizeQuery(first.query, { level: "predicate" });
        assert.deepStrictEqual(second.query, IMPOSSIBLE_SELECTOR);
        assert.deepStrictEqual(second.query, first.query);
    });

    it("继承侧含不可继承元数据（null 语义兄弟）时：不做 replaced-with-true 覆盖消除（相对仅 a:1 基线）", () => {
        const baseline = { $and: [{ a: 1 }, { $or: [{ a: 1 }, { b: 1 }] }] };
        const withUnsupportedInheritedSibling = {
            $and: [{ a: 1 }, { c: { $eq: null } }, { $or: [{ a: 1 }, { b: 1 }] }],
        };
        const observe = { collectScopeTraces: true };
        const baseMeta = normalizeQuery(baseline, { level: "scope", observe }).meta;
        const opMeta = normalizeQuery(withUnsupportedInheritedSibling, { level: "scope", observe }).meta;
        assert.ok(
            baseMeta.scopeTrace.events.some((e) => e.type === "coverage-removal" && e.outcome === "replaced-with-true")
        );
        assert.ok(
            !opMeta.scopeTrace.events.some((e) => e.type === "coverage-removal" && e.outcome === "replaced-with-true")
        );
    });

    it("detectCommonPredicatesInOr：开启时也不改写 query 结构（与 predicate 同形）", () => {
        const pred = normalizeQuery(commonPredicatesInOr, { level: "predicate" }).query;
        const scoped = normalizeQuery(commonPredicatesInOr, {
            level: "scope",
            rules: { detectCommonPredicatesInOr: true },
        }).query;
        assert.deepStrictEqual(scoped, pred);
    });

    it("剪枝后单子 $or 折叠：scope 二次 normalize 稳定", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 1 }] }] };
        const once = normalizeQuery(q, { level: "scope" });
        const twice = normalizeQuery(once.query, { level: "scope" });
        assert.deepStrictEqual(twice.query, once.query);
    });

    it("同字段传播与局部矛盾：scope 与 predicate 同形（保守不额外收紧）", () => {
        const q = { $or: [{ a: 1 }, { $and: [{ b: 1 }, { b: 2 }] }] };
        const pred = normalizeQuery(q, { level: "predicate" }).query;
        const scoped = normalizeQuery(q, { level: "scope" }).query;
        assert.deepStrictEqual(scoped, pred);
    });
});
