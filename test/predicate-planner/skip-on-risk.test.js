"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode, refreshBundleMetadata } = require("../../dist/predicate/ir/build-field-bundle.js");
const { planRelations } = require("../../dist/predicate/planner/relation-planner.js");
const { getDefaultPredicateCapabilities } = require("../../dist/predicate/registry/predicate-capability-registry.js");
const { DEFAULT_PREDICATE_SAFETY_POLICY } = require("../../dist/predicate/safety/predicate-safety-policy.js");

describe("predicate-planner / skip-on-risk", () => {
    it("opaque 与非 opaque 混合且 bailout 时清空 capabilities", () => {
        const base = buildFieldPredicateBundleFromFieldNode(
            fieldNode("a", [
                { op: "$eq", value: 1 },
                { op: "raw", value: { $regex: "x" }, opaque: true },
            ])
        );
        const bundle = refreshBundleMetadata(base);
        const ctx = {
            bundle,
            safety: DEFAULT_PREDICATE_SAFETY_POLICY,
            engine: { dedupeAtoms: true, mergeComparable: true, collapseContradictions: true },
        };
        const plan = planRelations(getDefaultPredicateCapabilities(), ctx);
        assert.equal(plan.capabilities.length, 0);
        assert.ok(plan.skippedCapabilities.length > 0);
    });
});
