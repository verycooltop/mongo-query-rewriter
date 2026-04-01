"use strict";

const assert = require("node:assert/strict");
const {
    assertPredicateIdempotent,
    assertAppliedCapabilitiesWhitelisted,
    assertNoFalseImpossible,
} = require("../helpers/predicate-test-helpers.js");

describe("contracts / predicate conservative contract", () => {
    describe("unsupported or high-risk mixes must remain conservative", () => {
        const cases = [
            { name: "$nin + eq", query: { $and: [{ a: { $nin: [2, 3] } }, { a: 1 }] } },
            { name: "$nin + in", query: { $and: [{ a: { $nin: [2, 3] } }, { a: { $in: [1, 2] } }] } },
            { name: "$nin + range", query: { $and: [{ a: { $nin: [2, 3] } }, { a: { $gt: 0 } }] } },
            { name: "$exists:false + null", query: { $and: [{ a: { $exists: false } }, { a: null }] } },
            { name: "$exists:false + eq", query: { $and: [{ a: { $exists: false } }, { a: { $eq: 1 } }] } },
            { name: "$exists:false + in", query: { $and: [{ a: { $exists: false } }, { a: { $in: [1, 2] } }] } },
            { name: "$exists:false + ne:null", query: { $and: [{ a: { $exists: false } }, { a: { $ne: null } }] } },
            { name: "$regex + eq", query: { $and: [{ a: { $regex: "^x" } }, { a: 1 }] } },
            { name: "$elemMatch + in", query: { $and: [{ a: { $elemMatch: { b: 1 } } }, { a: { $in: [1, 2] } }] } },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should not misrewrite`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                assertNoFalseImpossible(first);
                assert.ok(first.normalized);
            });
        }
    });

    describe("whole-object and dotted-path combinations must stay conservative", () => {
        const cases = [
            { name: "whole-object + same dotted path", query: { $and: [{ a: { b: 1 } }, { "a.b": 1 }] } },
            { name: "whole-object + sibling dotted path", query: { $and: [{ a: { b: 1 } }, { "a.c": 2 }] } },
            { name: "null parent + dotted path", query: { $and: [{ a: null }, { "a.b": 1 }] } },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should avoid aggressive merge`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                assertNoFalseImpossible(first);
                assert.ok(first.normalized);
            });
        }
    });
});
