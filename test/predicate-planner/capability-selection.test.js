"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../dist/predicate/ir/build-field-bundle.js");
const { planRelations } = require("../../dist/predicate/planner/relation-planner.js");
const { getDefaultPredicateCapabilities } = require("../../dist/predicate/registry/predicate-capability-registry.js");
const { DEFAULT_PREDICATE_SAFETY_POLICY } = require("../../dist/predicate/safety/predicate-safety-policy.js");

describe("predicate-planner / capability-selection", () => {
    it("无 $eq 时不选 eq.eq", () => {
        const bundle = buildFieldPredicateBundleFromFieldNode(fieldNode("a", [{ op: "$gt", value: 1 }]));
        const ctx = {
            bundle,
            safety: DEFAULT_PREDICATE_SAFETY_POLICY,
            engine: { dedupeAtoms: true, mergeComparable: true, collapseContradictions: true },
        };
        const plan = planRelations(getDefaultPredicateCapabilities(), ctx);
        assert.equal(plan.capabilities.some((c) => c.id === "eq.eq"), false);
    });
});
