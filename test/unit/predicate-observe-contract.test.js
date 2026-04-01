"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const {
    extractAppliedCapabilities,
    assertAppliedCapabilitiesWhitelisted,
} = require("../helpers/predicate-test-helpers.js");

describe("unit / predicate observe/meta contract", () => {
    it("should keep meta lightweight when observe is off", () => {
        const result = normalizeQuery(
            { $and: [{ a: 1 }, { a: { $in: [1, 2] } }] },
            { level: "predicate", observe: { collectPredicateTraces: false, collectWarnings: false } }
        );
        assert.equal(result.meta.predicateTraces, undefined);
        assert.equal(Array.isArray(result.meta.warnings), true);
        assert.equal(result.meta.warnings.length, 0);
    });

    it("should report only requested observe fields", () => {
        const result = normalizeQuery(
            { $and: [{ a: 1 }, { a: { $in: [1, 2] } }] },
            {
                level: "predicate",
                observe: {
                    collectWarnings: true,
                    collectPredicateTraces: false,
                },
            }
        );
        assert.equal(Array.isArray(result.meta.warnings), true);
        assert.equal(result.meta.predicateTraces, undefined);
    });

    it("should not falsely report high-risk cases as applied capability", () => {
        const result = normalizeQuery(
            { $and: [{ a: { $exists: false } }, { a: 1 }] },
            { level: "predicate", observe: { collectPredicateTraces: true, collectWarnings: true } }
        );
        assertAppliedCapabilitiesWhitelisted(result.meta);
        const applied = extractAppliedCapabilities(result.meta);
        assert.ok(!applied.includes("eq.in"));
        assert.ok(!applied.includes("eq.range"));
    });

    it("should expose consistent conservative signal for $nin + range", () => {
        const result = normalizeQuery(
            { $and: [{ a: { $nin: [2, 3] } }, { a: { $gt: 0 } }] },
            { level: "predicate", observe: { collectPredicateTraces: true, collectWarnings: true } }
        );
        assertAppliedCapabilitiesWhitelisted(result.meta);
    });

    it("should expose consistent conservative signal for $regex + eq", () => {
        const result = normalizeQuery(
            { $and: [{ a: { $regex: "^x" } }, { a: 1 }] },
            { level: "predicate", observe: { collectPredicateTraces: true, collectWarnings: true } }
        );
        assertAppliedCapabilitiesWhitelisted(result.meta);
    });
});
