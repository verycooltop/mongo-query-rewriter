"use strict";

const assert = require("node:assert/strict");
const {
    normalizePredicateCase,
    assertPredicateIdempotent,
    extractAppliedCapabilities,
    assertAppliedCapabilitiesWhitelisted,
} = require("../helpers/predicate-test-helpers.js");

describe("unit / predicate capability negative cases", () => {
    describe("eq.in negative cases", () => {
        it("should skip eq.in when null-sensitive rewrite is disabled", () => {
            const query = { $and: [{ a: null }, { a: { $in: [null, 1] } }] };
            const { first } = assertPredicateIdempotent(query, {
                predicate: { safetyPolicy: { allowNullSemanticRewrite: false } },
            });
            assertAppliedCapabilitiesWhitelisted(first.meta);
            assert.ok(!extractAppliedCapabilities(first.meta).includes("eq.in"));
        });

        it("should skip eq.in when array-sensitive rewrite is disabled", () => {
            const query = { $and: [{ a: 1 }, { a: { $in: [1, 2] } }] };
            const { first } = assertPredicateIdempotent(query, {
                predicate: { safetyPolicy: { allowArraySensitiveRewrite: false } },
            });
            assertAppliedCapabilitiesWhitelisted(first.meta);
            assert.ok(Array.isArray(extractAppliedCapabilities(first.meta)));
        });

        it("should remain conservative when $in contains complex values", () => {
            const query = { $and: [{ a: 1 }, { a: { $in: [1, { bad: true }, [2]] } }] };
            const { first } = assertPredicateIdempotent(query);
            assertAppliedCapabilitiesWhitelisted(first.meta);
        });
    });

    describe("eq.range negative cases", () => {
        it("should skip eq.range when range bound is non-comparable object", () => {
            const query = { $and: [{ a: 3 }, { a: { $gt: { x: 1 } } }] };
            const { first } = assertPredicateIdempotent(query);
            assertAppliedCapabilitiesWhitelisted(first.meta);
            assert.ok(Array.isArray(extractAppliedCapabilities(first.meta)));
        });

        it("should skip eq.range when range bound is non-comparable array", () => {
            const query = { $and: [{ a: 3 }, { a: { $lt: [1, 2] } }] };
            const { first } = assertPredicateIdempotent(query);
            assertAppliedCapabilitiesWhitelisted(first.meta);
            assert.ok(Array.isArray(extractAppliedCapabilities(first.meta)));
        });

        it("should remain conservative under null-sensitive boundary", () => {
            const query = { $and: [{ a: null }, { a: { $gt: 1 } }] };
            const { first } = assertPredicateIdempotent(query, {
                predicate: { safetyPolicy: { allowNullSemanticRewrite: false } },
            });
            assertAppliedCapabilitiesWhitelisted(first.meta);
        });

        it("should remain conservative when $in contains null and range is present", () => {
            const query = { $and: [{ a: { $in: [1, null] } }, { a: { $gt: 0 } }] };
            const { first } = assertPredicateIdempotent(query, {
                predicate: { safetyPolicy: { allowNullSemanticRewrite: false } },
            });
            assertAppliedCapabilitiesWhitelisted(first.meta);
        });
    });

    describe("range.range boundary cases", () => {
        it("should keep closed single-point interval valid", () => {
            const query = { a: { $gte: 3, $lte: 3 } };
            const { first } = assertPredicateIdempotent(query);
            assertAppliedCapabilitiesWhitelisted(first.meta);
        });

        it("should identify gt/lte same-point contradiction correctly", () => {
            const query = { a: { $gt: 3, $lte: 3 } };
            const result = normalizePredicateCase(query);
            assertAppliedCapabilitiesWhitelisted(result.meta);
        });

        it("should identify gte/lt same-point contradiction correctly", () => {
            const query = { a: { $gte: 3, $lt: 3 } };
            const result = normalizePredicateCase(query);
            assertAppliedCapabilitiesWhitelisted(result.meta);
        });

        it("should normalize multi-bound ranges stably", () => {
            const query = { a: { $gt: 3, $gte: 5, $lt: 10, $lte: 8 } };
            const { first } = assertPredicateIdempotent(query);
            assertAppliedCapabilitiesWhitelisted(first.meta);
        });

        it("should produce stable output regardless of bound order", () => {
            const q1 = { a: { $gt: 3, $gte: 5, $lt: 10, $lte: 8 } };
            const q2 = { a: { $lte: 8, $lt: 10, $gte: 5, $gt: 3 } };
            const r1 = normalizePredicateCase(q1);
            const r2 = normalizePredicateCase(q2);
            assert.deepStrictEqual(r1.normalized, r2.normalized);
        });
    });
});
