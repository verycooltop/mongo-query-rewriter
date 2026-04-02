"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");
const {
    extractAppliedCapabilities,
    extractSkippedCapabilities,
    extractWarnings,
} = require("./extract-predicate-observe.js");

const ALLOWED_PREDICATE_CAPABILITIES = ["eq.eq", "eq.ne", "ne.ne", "nin.nin", "eq.in", "eq.range", "range.range"];

function normalizePredicateCase(query, options = {}) {
    const mergedOptions = {
        level: "predicate",
        observe: {
            collectWarnings: true,
            collectPredicateTraces: true,
        },
        ...options,
        observe: {
            collectWarnings: true,
            collectPredicateTraces: true,
            ...(options.observe || {}),
        },
    };
    const rawResult = normalizeQuery(query, mergedOptions);
    return {
        normalized: rawResult.query,
        meta: rawResult.meta,
        rawResult,
    };
}

function assertPredicateIdempotent(query, options = {}) {
    const first = normalizePredicateCase(query, options);
    const second = normalizePredicateCase(first.normalized, options);
    assert.deepStrictEqual(second.normalized, first.normalized);
    return { first, second };
}

function assertAppliedCapabilitiesWhitelisted(meta) {
    const applied = extractAppliedCapabilities(meta);
    for (const capability of applied) {
        assert.ok(
            ALLOWED_PREDICATE_CAPABILITIES.includes(capability),
            `unexpected predicate capability applied: ${capability}`
        );
    }
}

function assertNoFalseImpossible(result) {
    assert.notDeepStrictEqual(result.normalized, IMPOSSIBLE_SELECTOR);
    if (result.meta && Array.isArray(result.meta.predicateTraces)) {
        const emittedImpossible = result.meta.predicateTraces.some((trace) => trace.impossibleEmitted === true);
        assert.equal(emittedImpossible, false);
    }
}

module.exports = {
    ALLOWED_PREDICATE_CAPABILITIES,
    normalizePredicateCase,
    assertPredicateIdempotent,
    extractAppliedCapabilities,
    extractSkippedCapabilities,
    extractWarnings,
    assertAppliedCapabilitiesWhitelisted,
    assertNoFalseImpossible,
};
