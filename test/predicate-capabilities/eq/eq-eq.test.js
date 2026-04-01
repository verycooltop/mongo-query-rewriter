"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");
const { eqEqCapability } = require("../../../dist/predicate/capabilities/eq/eq-eq.js");
const { DEFAULT_PREDICATE_SAFETY_POLICY } = require("../../../dist/predicate/safety/predicate-safety-policy.js");

function runEngine(fieldNodeInput) {
    const bundle = buildFieldPredicateBundleFromFieldNode(fieldNodeInput);
    return normalizeFieldPredicateBundle(bundle, {});
}

describe("predicate-capabilities / eq.eq", () => {
    it("positive：合并同值重复 $eq", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$eq", value: 1 },
        ]);
        const r = runEngine(node);
        assert.equal(r.contradiction, false);
        assert.equal(r.normalizedBundle.predicates.filter((p) => p.kind === "eq").length, 1);
        assert.ok(r.changed);
    });

    it("contradiction：不同 $eq", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$eq", value: 2 },
        ]);
        const r = runEngine(node);
        assert.equal(r.contradiction, true);
    });

    it("non-applicable：单个 $eq", () => {
        const node = fieldNode("a", [{ op: "$eq", value: 1 }]);
        const ctx = {
            bundle: buildFieldPredicateBundleFromFieldNode(node),
            safety: DEFAULT_PREDICATE_SAFETY_POLICY,
            engine: { dedupeAtoms: true, mergeComparable: true, collapseContradictions: true },
        };
        assert.equal(eqEqCapability.isApplicable(ctx), false);
    });

    it("idempotent：二次 stable", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$eq", value: 1 },
        ]);
        const b1 = buildFieldPredicateBundleFromFieldNode(node);
        const r1 = normalizeFieldPredicateBundle(b1, {});
        const r2 = normalizeFieldPredicateBundle(r1.normalizedBundle, {});
        assert.equal(r2.changed, false);
        assert.equal(r2.contradiction, false);
    });

    it("passthrough：无 $eq", () => {
        const node = fieldNode("a", [{ op: "$gt", value: 1 }]);
        const r = runEngine(node);
        assert.equal(r.contradiction, false);
        assert.equal(r.appliedCapabilities.includes("eq.eq"), false);
    });
});
