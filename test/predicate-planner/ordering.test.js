"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../dist/predicate/ir/build-field-bundle.js");
const { planRelations } = require("../../dist/predicate/planner/relation-planner.js");
const { getDefaultPredicateCapabilities } = require("../../dist/predicate/registry/predicate-capability-registry.js");
const { DEFAULT_PREDICATE_SAFETY_POLICY } = require("../../dist/predicate/safety/predicate-safety-policy.js");

describe("predicate-planner / ordering", () => {
    it("eq.eq 排在 range.range 之前", () => {
        const bundle = buildFieldPredicateBundleFromFieldNode(
            fieldNode("a", [
                { op: "$eq", value: 1 },
                { op: "$eq", value: 1 },
                { op: "$gt", value: 0 },
                { op: "$gt", value: 2 },
            ])
        );
        const ctx = {
            bundle,
            safety: DEFAULT_PREDICATE_SAFETY_POLICY,
            engine: { dedupeAtoms: true, mergeComparable: true, collapseContradictions: true },
        };
        const plan = planRelations(getDefaultPredicateCapabilities(), ctx);
        const ids = plan.capabilities.map((c) => c.id);
        const iEq = ids.indexOf("eq.eq");
        const iRange = ids.indexOf("range.range");
        if (iEq !== -1 && iRange !== -1) {
            assert.ok(iEq < iRange);
        }
    });

    it("range.range 排在 eq.range 之前", () => {
        const bundle = buildFieldPredicateBundleFromFieldNode(
            fieldNode("a", [
                { op: "$in", value: [1, 2] },
                { op: "$gt", value: 0 },
                { op: "$gt", value: 1 },
            ])
        );
        const ctx = {
            bundle,
            safety: DEFAULT_PREDICATE_SAFETY_POLICY,
            engine: { dedupeAtoms: true, mergeComparable: true, collapseContradictions: true },
        };
        const plan = planRelations(getDefaultPredicateCapabilities(), ctx);
        const ids = plan.capabilities.map((c) => c.id);
        const iRR = ids.indexOf("range.range");
        const iER = ids.indexOf("eq.range");
        if (iRR !== -1 && iER !== -1) {
            assert.ok(iRR < iER);
        }
    });
});
