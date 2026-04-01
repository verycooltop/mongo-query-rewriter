"use strict";

const {
    assertPredicateIdempotent,
    assertAppliedCapabilitiesWhitelisted,
    assertNoFalseImpossible,
} = require("../helpers/predicate-test-helpers.js");

describe("unit / predicate high risk cases", () => {
    describe("$exists:false combinations", () => {
        const cases = [
            { name: "$exists:false + null", query: { $and: [{ a: { $exists: false } }, { a: null }] } },
            { name: "$exists:false + eq:null", query: { $and: [{ a: { $exists: false } }, { a: { $eq: null } }] } },
            { name: "$exists:false + ne:null", query: { $and: [{ a: { $exists: false } }, { a: { $ne: null } }] } },
            { name: "$exists:false + in[null,1]", query: { $and: [{ a: { $exists: false } }, { a: { $in: [null, 1] } }] } },
            { name: "$exists:false + gt", query: { $and: [{ a: { $exists: false } }, { a: { $gt: 1 } }] } },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should remain conservative`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                assertNoFalseImpossible(first);
            });
        }
    });

    describe("$nin mixed with supported capabilities", () => {
        const cases = [
            { name: "$nin + eq", query: { $and: [{ a: { $nin: [2, 3] } }, { a: 1 }] } },
            { name: "$nin + in", query: { $and: [{ a: { $nin: [2, 3] } }, { a: { $in: [1, 2] } }] } },
            { name: "$nin + gt", query: { $and: [{ a: { $nin: [2, 3] } }, { a: { $gt: 0 } }] } },
            { name: "$nin + exists:true", query: { $and: [{ a: { $nin: [2, 3] } }, { a: { $exists: true } }] } },
            { name: "$nin:[null] + null", query: { $and: [{ a: { $nin: [null] } }, { a: null }] } },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should not be damaged by supported rewrites`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                assertNoFalseImpossible(first);
            });
        }
    });

    describe("non-comparable range values", () => {
        const cases = [
            { name: "object in range bound", query: { a: { $gt: { x: 1 }, $lt: 5 } }, assertNoImpossible: true },
            { name: "array in range bound", query: { a: { $gte: [1, 2], $lte: 9 } }, assertNoImpossible: true },
            { name: "date vs number mix", query: { $and: [{ a: { $gt: new Date("2024-01-01") } }, { a: 3 }] }, assertNoImpossible: false },
            { name: "bad object lower/upper mix", query: { $and: [{ a: { $lt: { bad: true } } }, { a: { $gt: 1 } }] }, assertNoImpossible: true },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should not incorrectly tighten or contradict`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                if (testCase.assertNoImpossible) {
                    assertNoFalseImpossible(first);
                }
            });
        }
    });

    describe("whole-object / dotted-path mixes", () => {
        const cases = [
            { name: "whole-object + dotted eq", query: { $and: [{ a: { b: 1 } }, { "a.b": 1 }] } },
            { name: "whole-object + dotted in", query: { $and: [{ a: { b: 1 } }, { "a.b": { $in: [1, 2] } }] } },
            { name: "whole-object + sibling dotted", query: { $and: [{ a: { b: 1 } }, { "a.c": 2 }] } },
            { name: "null + dotted path", query: { $and: [{ a: null }, { "a.b": 1 }] } },
        ];

        for (const testCase of cases) {
            it(`${testCase.name} should remain structurally conservative`, () => {
                const { first } = assertPredicateIdempotent(testCase.query);
                assertAppliedCapabilitiesWhitelisted(first.meta);
                assertNoFalseImpossible(first);
            });
        }
    });
});
