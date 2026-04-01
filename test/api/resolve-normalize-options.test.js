"use strict";

const assert = require("node:assert/strict");
const { resolveNormalizeOptions } = require("../../dist/index.js");

describe("api / resolveNormalizeOptions", () => {
    it("非法 level 抛错（含历史字符串 logical）", () => {
        assert.throws(
            () => resolveNormalizeOptions({ level: "logical" }),
            /invalid normalize level/
        );
        assert.throws(
            () => resolveNormalizeOptions({ level: "nope" }),
            /invalid normalize level/
        );
    });

    it("默认 level 为 shape", () => {
        const r = resolveNormalizeOptions({});
        assert.equal(r.level, "shape");
        assert.equal(r.rules.flattenLogical, true);
    });

    it("各 level 挂载对应默认 rules 标志", () => {
        const shape = resolveNormalizeOptions({ level: "shape" });
        assert.equal(shape.rules.dedupeSameFieldPredicates, false);
        assert.equal(shape.rules.detectCommonPredicatesInOr, false);

        const predicate = resolveNormalizeOptions({ level: "predicate" });
        assert.equal(predicate.rules.dedupeSameFieldPredicates, true);
        assert.equal(predicate.rules.collapseContradictions, true);
        assert.equal(predicate.rules.detectCommonPredicatesInOr, false);

        const scope = resolveNormalizeOptions({ level: "scope" });
        assert.equal(scope.rules.dedupeSameFieldPredicates, true);
        assert.equal(scope.rules.detectCommonPredicatesInOr, true);
    });

    it("rules 与 level 默认 merge：显式 false 覆盖默认 true", () => {
        const r = resolveNormalizeOptions({
            level: "predicate",
            rules: { dedupeSameFieldPredicates: false },
        });
        assert.equal(r.rules.dedupeSameFieldPredicates, false);
        assert.equal(r.rules.mergeComparablePredicates, true);
    });

    it("safety 与默认 merge", () => {
        const r = resolveNormalizeOptions({ safety: { maxNormalizeDepth: 99 } });
        assert.equal(r.safety.maxNormalizeDepth, 99);
        assert.equal(typeof r.safety.maxNodeGrowthRatio, "number");
    });

    it("observe 与默认 merge（含 trace 开关）", () => {
        const r = resolveNormalizeOptions({ observe: { collectMetrics: true } });
        assert.equal(r.observe.collectMetrics, true);
        assert.equal(r.observe.collectWarnings, true);
        assert.equal(r.observe.collectPredicateTraces, false);
        assert.equal(r.observe.collectScopeTraces, false);
    });

    it("predicate / scope safetyPolicy 与默认 partial merge、互不覆盖", () => {
        const r = resolveNormalizeOptions({
            predicate: { safetyPolicy: { allowArraySensitiveRewrite: true } },
            scope: { safetyPolicy: { allowBranchPruning: false } },
        });
        assert.equal(r.predicate.safetyPolicy.allowArraySensitiveRewrite, true);
        assert.equal(r.predicate.safetyPolicy.allowNullSemanticRewrite, false);
        assert.equal(r.scope.safetyPolicy.allowBranchPruning, false);
        assert.equal(r.scope.safetyPolicy.allowOrPropagation, true);
    });
});
