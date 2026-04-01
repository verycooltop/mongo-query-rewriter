"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("api / observe traces（predicate + scope）", () => {
    it("collectPredicateTraces：meta.predicateTraces 含 atomKinds 与 skippedCapabilities", () => {
        const { meta } = normalizeQuery(
            { a: { $gt: 1, $lt: 10 } },
            {
                level: "predicate",
                observe: { collectPredicateTraces: true },
            }
        );
        assert.ok(Array.isArray(meta.predicateTraces));
        assert.ok(meta.predicateTraces.length >= 1);
        const t = meta.predicateTraces[0];
        assert.ok(t.atomKinds.includes("gt") || t.atomKinds.includes("lt"));
        assert.ok(Array.isArray(t.skippedCapabilities));
        assert.ok(typeof t.contradiction === "boolean");
        assert.ok(typeof t.coverageAtomCount === "number");
        assert.ok(typeof t.impossibleEmitted === "boolean");
    });

    it("collectPredicateTraces：矛盾字段带 contradictionCapabilityId 与 impossibleEmitted", () => {
        const { meta } = normalizeQuery(
            { $and: [{ a: { $eq: 1 } }, { a: { $gt: 9 } }] },
            {
                level: "predicate",
                observe: { collectPredicateTraces: true },
            }
        );
        const t = meta.predicateTraces.filter((x) => x.field === "a").find((x) => x.contradiction);
        assert.ok(t);
        assert.equal(t.contradiction, true);
        assert.equal(t.impossibleEmitted, true);
        assert.ok(typeof t.contradictionCapabilityId === "string");
    });

    it("collectScopeTraces：coverage / prune 类事件可观测", () => {
        const { meta } = normalizeQuery(
            { $and: [{ a: 1 }, { $or: [{ a: 1 }, { b: 2 }] }] },
            {
                level: "scope",
                observe: { collectScopeTraces: true },
            }
        );
        assert.ok(meta.scopeTrace);
        assert.ok(Array.isArray(meta.scopeTrace.events));
        assert.ok(
            meta.scopeTrace.events.some(
                (e) => e.type === "coverage-removal" && e.outcome === "replaced-with-true"
            )
        );
    });

    it("collectScopeTraces：constraintRejections 汇总非空字段的跳过原因", () => {
        const { meta } = normalizeQuery(
            { $and: [{ $or: [{ a: 1 }] }, { b: { $exists: true } }] },
            {
                level: "scope",
                observe: { collectScopeTraces: true },
            }
        );
        assert.ok(meta.scopeTrace);
        assert.ok(
            meta.scopeTrace.constraintRejections.some((r) => r.atomKind === "exists" || r.reason.includes("exists"))
        );
    });

    it("collectScopeTraces：多 $exists 兄弟各自产生 exists 类 rejection（内容与 reason 与 phase-1 护栏一致）", () => {
        const q = {
            $and: [{ b: { $exists: true } }, { c: { $exists: true } }, { a: 1 }],
        };
        const { meta } = normalizeQuery(q, {
            level: "scope",
            observe: { collectScopeTraces: true },
        });
        assert.ok(meta.scopeTrace);
        const forB = meta.scopeTrace.constraintRejections.filter((r) => r.fieldPath === "b" && r.atomKind === "exists");
        const forC = meta.scopeTrace.constraintRejections.filter((r) => r.fieldPath === "c" && r.atomKind === "exists");
        assert.ok(forB.length >= 1);
        assert.ok(forC.length >= 1);
        const reason = "exists semantics are not inherited in phase 1";
        assert.ok(forB.every((r) => r.reason === reason));
        assert.ok(forC.every((r) => r.reason === reason));
    });
});
